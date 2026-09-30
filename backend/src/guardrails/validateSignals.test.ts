import { describe, expect, it } from "vitest";
import { extractMetrics, findGroundedText, isVagueFact, validateSignals, MAX_FACTS, MAX_HIGHLIGHTS, type EvidenceText } from "./validateSignals";
import type { HighSignalFact, InlineHighlight, SignalAnalysisResponse } from "../openai/signalsSchema";

const evidence: EvidenceText[] = [
  {
    id: "experience:0",
    section: "experience",
    text: "Web Lead — Robotics Club — Led a 4-person web team. Helped the project earn 3rd place at the State Conference and reached 300+ visitors.",
  },
  {
    id: "about:0",
    section: "about",
    text:
      "Driven by a love of puzzles, I joined Northfield Coding School at age 9. The school focused on building real products rather than theory. " +
      "At age 14, I was accepted into the Advanced Engineering track (a track intended for students aged 17 and older) thanks to a first-place ranking on the school leaderboard. " +
      "Over 6 years, I learned Java, Go, and SQL. In 2024, I earned an Advanced Diploma in Software Engineering. " +
      "Outside of class I enjoy reading, hiking with friends, and trying new recipes, and I always look for ways to keep learning and growing as a person.",
  },
  { id: "volunteering:0", section: "volunteering", text: "Tutor — Math Center — Completed 60+ hours of tutoring in Java, supporting 15+ students" },
  { id: "headline:0", section: "headline", text: "Student developer and tutor" },
];

function highlight(overrides: Partial<InlineHighlight> = {}): InlineHighlight {
  return { evidenceId: "experience:0", quote: "Led a 4-person web team", type: "leadership", importance: 0.9, ...overrides };
}

function fact(overrides: Partial<HighSignalFact> = {}): HighSignalFact {
  return {
    text: "Led a 4-person web team",
    kind: "leadership",
    importance: 0.9,
    support: [{ evidenceId: "experience:0", quote: "Led a 4-person web team" }],
    ...overrides,
  };
}

function run(response: Partial<SignalAnalysisResponse>) {
  return validateSignals({ facts: [], highlights: [], ...response }, evidence);
}

describe("findGroundedText", () => {
  it("returns the original substring despite whitespace, case, and dash differences", () => {
    expect(findGroundedText("Reached  300+ visitors – fast", "reached 300+ visitors - fast")).toBe("Reached  300+ visitors – fast");
  });

  it("returns null when the text is not present", () => {
    expect(findGroundedText("Led a team", "Led a 10-person team")).toBeNull();
  });
});

describe("extractMetrics", () => {
  it("finds counts, rankings, ages, money, and durations with what they measure", () => {
    expect(extractMetrics("Led a 4-person web team")).toEqual(["4-person"]);
    expect(extractMetrics("earn 3rd place at the State Conference")).toEqual(["3rd place"]);
    expect(extractMetrics("placed 2nd at the state olympiad")).toEqual(["2nd"]);
    expect(extractMetrics("Completed 60+ hours of tutoring, supporting 15+ students")).toEqual(["60+ hours", "15+ students"]);
    expect(extractMetrics("At age 14, I was accepted")).toEqual(["age 14"]);
    expect(extractMetrics("raised $12k and grew signups 40%")).toEqual(["$12k", "40%"]);
    expect(extractMetrics("Over 6 years")).toEqual(["6 years"]);
  });

  it("ignores years, date ranges, and bare numbers", () => {
    expect(extractMetrics("In 2024, I earned")).toEqual([]);
    expect(extractMetrics("Sep 2021 - Jun 2025")).toEqual([]);
    expect(extractMetrics("students aged 17 and older")).toEqual([]);
  });
});

describe("high-signal facts", () => {
  it("keeps the number in a grounded fact", () => {
    expect(run({ facts: [fact()] }).facts).toEqual([{ text: "Led a 4-person web team", kind: "leadership", evidenceId: "experience:0", evidenceIds: ["experience:0"] }]);
  });

  it("keeps an unusual age and program comparison as a fact", () => {
    const admission = fact({
      text: "Accepted into a 17+ engineering track at age 14",
      kind: "selective_admission",
      support: [{ evidenceId: "about:0", quote: "At age 14, I was accepted into the Advanced Engineering track (a track intended for students aged 17 and older)" }],
    });
    expect(run({ facts: [admission] }).facts.map((f) => f.text)).toEqual(["Accepted into a 17+ engineering track at age 14"]);
  });

  it("keeps a competitive ranking, reading spelled-out ordinals as numbers", () => {
    const ranking = fact({ text: "Ranked 1st on the school leaderboard", kind: "competitive_result", support: [{ evidenceId: "about:0", quote: "first-place ranking on the school leaderboard" }] });
    expect(run({ facts: [ranking] }).facts).toHaveLength(1);
  });

  it("rejects vague category labels in place of a fact", () => {
    for (const text of ["Web team size", "State Conference result", "Tutoring hours delivered", "Programming experience", "Audience range"]) {
      expect(isVagueFact(text)).toBe(true);
      expect(run({ facts: [fact({ text })] }).facts).toEqual([]);
    }
    expect(isVagueFact("3rd place at the State Conference")).toBe(false);
  });

  it("ranks quantified facts above unquantified ones of similar importance", () => {
    const facts = run({
      facts: [
        fact({ text: "Web Lead at Robotics Club", kind: "leadership", importance: 0.85, support: [{ evidenceId: "experience:0", quote: "Web Lead" }] }),
        fact({ text: "3rd place at the State Conference", kind: "competitive_result", importance: 0.8, support: [{ evidenceId: "experience:0", quote: "earn 3rd place at the State Conference" }] }),
      ],
    }).facts;
    expect(facts.map((f) => f.text)).toEqual(["3rd place at the State Conference", "Web Lead at Robotics Club"]);
  });

  it("rejects a fact with a number or a name the evidence never mentions", () => {
    expect(run({ facts: [fact({ text: "Led a 40-person web team" })] }).facts).toEqual([]);
    expect(run({ facts: [fact({ text: "Admitted to MIT at age 14", support: [{ evidenceId: "about:0", quote: "At age 14, I was accepted" }] })] }).facts).toEqual([]);
  });

  it("requires every supporting quote to exist in its own evidence", () => {
    const mixed = fact({
      text: "Tutored 15+ students and led a 4-person team",
      support: [
        { evidenceId: "volunteering:0", quote: "supporting 15+ students" },
        { evidenceId: "experience:0", quote: "Led a 12-person web team" },
      ],
    });
    expect(run({ facts: [mixed] }).facts).toEqual([]);
    const combined = fact({ ...mixed, support: [mixed.support[0]!, { evidenceId: "experience:0", quote: "Led a 4-person web team" }] });
    expect(run({ facts: [combined] }).facts[0]!.evidenceIds).toEqual(["volunteering:0", "experience:0"]);
  });

  it("rejects unknown evidence, bad importance, and duplicates, and caps the count", () => {
    expect(run({ facts: [fact({ support: [{ evidenceId: "experience:9", quote: "Led a 4-person web team" }] })] }).facts).toEqual([]);
    expect(run({ facts: [fact({ importance: 1.4 })] }).facts).toEqual([]);
    expect(run({ facts: [fact(), fact({ text: "led a 4-person web team." })] }).facts).toHaveLength(1);
    const many = Array.from({ length: 15 }, (_, i) => fact({ text: `Led a 4-person web team, note ${String.fromCharCode(97 + i)}` }));
    expect(run({ facts: many }).facts).toHaveLength(MAX_FACTS);
  });
});

describe("inline highlights", () => {
  it("can exist without any sidebar fact", () => {
    const result = run({ highlights: [highlight()] });
    expect(result.facts).toEqual([]);
    expect(result.highlights).toEqual([
      { evidenceId: "experience:0", section: "experience", quote: "Led a 4-person web team", type: "leadership", importance: 0.9, metrics: ["4-person"] },
    ]);
  });

  it("keeps several concise phrases from one dense paragraph, as exact source text", () => {
    const quotes = [
      "joined Northfield Coding School at age 9",
      "building real products rather than theory",
      "at age 14, i was accepted into the advanced engineering track",
      "a track intended for students aged 17 and older",
      "Over 6 years",
      "earned an Advanced Diploma in Software Engineering",
    ];
    const result = run({ highlights: quotes.map((quote, i) => highlight({ evidenceId: "about:0", quote, type: "milestone", importance: 0.9 - i * 0.05 })) });
    expect(result.highlights.map((h) => h.quote)).toEqual([
      "joined Northfield Coding School at age 9",
      "building real products rather than theory",
      "At age 14, I was accepted into the Advanced Engineering track",
      "a track intended for students aged 17 and older",
      "Over 6 years",
      "earned an Advanced Diploma in Software Engineering",
    ]);
    expect(result.highlights[0]!.metrics).toEqual(["age 9"]);
  });

  it("keeps only the lead-in of a long list", () => {
    const list = "Over 6 years, I learned Java, Go, and SQL";
    const long = `${list}, Rust, Kotlin, Swift, Ruby, Perl, PHP, Scala, Haskell, Elixir, Dart, Lua, web development, robotics, game design, and database management`;
    const source: EvidenceText = { id: "about:1", section: "about", text: `I started young and kept going for a long time. ${long}. I also enjoy teaching others what I learn.` };
    const result = validateSignals({ facts: [], highlights: [highlight({ evidenceId: "about:1", quote: long })] }, [source]);
    expect(result.highlights.map((h) => h.quote)).toEqual(["Over 6 years, I learned Java, Go, and SQL, Rust, Kotlin, Swift"]);
  });

  it("rejects paraphrased or invented phrases", () => {
    expect(run({ highlights: [highlight({ quote: "Led a 12-person web team" })] }).highlights).toEqual([]);
    expect(run({ highlights: [highlight({ evidenceId: "missing:1" })] }).highlights).toEqual([]);
  });

  it("leaves generic filler unhighlighted when the model rates it low", () => {
    const filler = highlight({ evidenceId: "about:0", quote: "Driven by a love of puzzles", type: "other_evidence", importance: 0.2 });
    expect(run({ highlights: [filler] }).highlights).toEqual([]);
  });

  it("never highlights an entry title, organization, or the headline on its own", () => {
    for (const quote of ["Web Lead", "Robotics Club"]) expect(run({ highlights: [highlight({ quote })] }).highlights).toEqual([]);
    expect(run({ highlights: [highlight({ evidenceId: "headline:0", quote: "Student developer" })] }).highlights).toEqual([]);
  });

  it("rejects a bare number or duration, and whole paragraphs", () => {
    expect(run({ highlights: [highlight({ evidenceId: "about:0", quote: "6 years" })] }).highlights).toEqual([]);
    const paragraph = evidence[1]!.text.slice(0, 190);
    expect(run({ highlights: [highlight({ evidenceId: "about:0", quote: paragraph })] }).highlights).toEqual([]);
  });

  it("keeps one of two nested phrases and never covers most of an item", () => {
    const nested = run({ highlights: [highlight({ quote: "Led a 4-person web team" }), highlight({ quote: "4-person web team", importance: 0.8 })] });
    expect(nested.highlights.map((h) => h.quote)).toEqual(["Led a 4-person web team"]);

    const sentences = evidence[1]!.text.split(". ").map((s) => s.replace(/\.$/, ""));
    const dense = run({ highlights: sentences.map((quote) => highlight({ evidenceId: "about:0", quote: quote.slice(0, 180) })) });
    const covered = dense.highlights.reduce((sum, h) => sum + h.quote.length, 0);
    expect(covered).toBeLessThanOrEqual(evidence[1]!.text.length * 0.6);
  });

  it("orders by importance and caps the count", () => {
    const words = ["Java", "Go, and SQL", "SQL"];
    const many = Array.from({ length: 60 }, (_, i) => highlight({ evidenceId: "about:0", quote: words[i % 3]!, importance: 0.5 + (i % 3) * 0.1 }));
    const result = run({ highlights: many });
    expect(result.highlights.map((h) => h.quote)).toEqual(["SQL", "Java"]);
    expect(MAX_HIGHLIGHTS).toBeGreaterThan(result.highlights.length);
  });
});
