import { describe, expect, it } from "vitest";
import { extractMetrics, findGroundedText, isVagueFact, validateSignals, MAX_FACTS, MAX_HIGHLIGHTS, type EvidenceText } from "./validateSignals";
import type { HighlightRole, HighSignalFact, SignalAnalysisResponse } from "../openai/signalsSchema";

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

function entry(evidenceId: string, quotes: string[], role: HighlightRole = "primary") {
  return { evidenceId, highlights: quotes.map((quote) => ({ quote, role })) };
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
  return validateSignals({ facts: [], entries: [], ...response }, evidence);
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
  const quotes = (result: { highlights: { quote: string }[] }) => result.highlights.map((h) => h.quote);

  it("can exist without any sidebar fact", () => {
    const result = run({ entries: [entry("experience:0", ["Led a 4-person web team"])] });
    expect(result.facts).toEqual([]);
    expect(result.highlights).toEqual([
      { evidenceId: "experience:0", section: "experience", quote: "Led a 4-person web team", type: "primary", importance: 0.9, metrics: ["4-person"] },
    ]);
  });

  it("keeps several concise phrases from one dense paragraph, as exact source text in reading order", () => {
    const result = run({
      entries: [
        entry("about:0", ["at age 14, i was accepted into the advanced engineering track", "a track intended for students aged 17 and older", "Over 6 years"]),
        entry("about:0", ["joined Northfield Coding School at age 9", "building real products rather than theory"], "secondary"),
      ],
    });
    expect(quotes(result)).toEqual([
      "joined Northfield Coding School at age 9",
      "building real products rather than theory",
      "At age 14, I was accepted into the Advanced Engineering track",
      "a track intended for students aged 17 and older",
      "Over 6 years",
    ]);
    expect(result.highlights.map((h) => h.type)).toEqual(["secondary", "secondary", "primary", "primary", "primary"]);
  });

  it("gives every meaningful entry its own highlights, however strong another entry is", () => {
    const dense = entry("about:0", [
      "joined Northfield Coding School at age 9",
      "building real products rather than theory",
      "At age 14, I was accepted into the Advanced Engineering track",
      "a track intended for students aged 17 and older",
      "first-place ranking on the school leaderboard",
      "Over 6 years",
      "earned an Advanced Diploma in Software Engineering",
    ]);
    const result = run({
      entries: [dense, entry("experience:0", ["Led a 4-person web team", "reached 300+ visitors"]), entry("volunteering:0", ["60+ hours of tutoring in Java"], "secondary")],
    });
    const byEntry = (id: string) => result.highlights.filter((h) => h.evidenceId === id).length;
    expect(byEntry("experience:0")).toBe(2);
    expect(byEntry("volunteering:0")).toBe(1);
    expect(byEntry("about:0")).toBeLessThanOrEqual(6);
  });

  it("shares the safety cap evenly instead of letting one entry use it up", () => {
    const many: EvidenceText[] = Array.from({ length: 30 }, (_, i) => ({
      id: `experience:${i}`,
      section: "experience",
      text: `Role ${i} — Org — Built tool alpha ${i} for the team. Shipped feature beta ${i} to users. Improved process gamma ${i} for everyone. Wrote guide delta ${i} for new members.`,
    }));
    const entries = many.map((m, i) => entry(m.id, [`Built tool alpha ${i}`, `Shipped feature beta ${i}`, `Improved process gamma ${i}`, `Wrote guide delta ${i}`]));
    const result = validateSignals({ facts: [], entries }, many);
    expect(result.highlights).toHaveLength(MAX_HIGHLIGHTS);
    expect(new Set(result.highlights.map((h) => h.evidenceId)).size).toBe(30);
  });

  it("keeps the context around a number instead of the number alone", () => {
    const result = run({ entries: [entry("volunteering:0", ["60+", "60+ hours of tutoring in Java", "supporting 15+ students"])] });
    expect(quotes(result)).toEqual(["60+ hours of tutoring in Java", "supporting 15+ students"]);
  });

  it("never highlights a date, duration, or date range on its own", () => {
    const dated: EvidenceText = { id: "experience:5", section: "experience", text: "Web Developer — Club — Mar 2026 - Present · 7 mos — Built the club website used by 200+ members" };
    const result = validateSignals({ facts: [], entries: [entry("experience:5", ["Mar 2026 - Present · 7 mos", "7 mos", "Built the club website used by 200+ members"])] }, [dated]);
    expect(quotes(result)).toEqual(["Built the club website used by 200+ members"]);
  });

  it("keeps only the lead-in of a long list", () => {
    const list = "Over 6 years, I learned Java, Go, and SQL";
    const long = `${list}, Rust, Kotlin, Swift, Ruby, Perl, PHP, Scala, Haskell, Elixir, Dart, Lua, web development, robotics, game design, and database management`;
    const source: EvidenceText = { id: "about:1", section: "about", text: `I started young and kept going for a long time. ${long}. I also enjoy teaching others what I learn.` };
    const result = validateSignals({ facts: [], entries: [entry("about:1", [long])] }, [source]);
    expect(quotes(result)).toEqual(["Over 6 years, I learned Java, Go, and SQL, Rust"]);

    const occasions = "Created and edited videos for graduations, New Year celebrations, International Women's Day, family events, and other special occasions";
    const video: EvidenceText = {
      id: "experience:7",
      section: "experience",
      text: `Editor — Studio — ${occasions}. Worked with teachers to plan each video and chose music, themes, and transitions that fit every event and audience.`,
    };
    expect(quotes(validateSignals({ facts: [], entries: [entry("experience:7", [occasions])] }, [video]))).toEqual(["Created and edited videos for graduations, New Year celebrations"]);
  });

  it("rejects paraphrased or invented phrases and unknown items", () => {
    expect(run({ entries: [entry("experience:0", ["Led a 12-person web team"])] }).highlights).toEqual([]);
    expect(run({ entries: [entry("missing:1", ["Led a 4-person web team"])] }).highlights).toEqual([]);
  });

  it("leaves generic filler unhighlighted when the model gives an item nothing", () => {
    expect(run({ entries: [entry("experience:0", ["Led a 4-person web team"])] }).highlights.some((h) => h.evidenceId === "about:0")).toBe(false);
  });

  it("never highlights an entry title, organization, or the headline on its own", () => {
    expect(run({ entries: [entry("experience:0", ["Web Lead", "Robotics Club"])] }).highlights).toEqual([]);
    const cert: EvidenceText = { id: "certifications:0", section: "certifications", text: "Northfield School, Advanced Engineering Track — Northfield · Issued May 2025 · Credential ID AB-123" };
    const certResult = validateSignals({ facts: [], entries: [entry("certifications:0", ["Advanced Engineering Track", "Issued May 2025", "Credential ID AB-123"])] }, [cert]);
    expect(certResult.highlights).toEqual([]);
    expect(run({ entries: [entry("headline:0", ["Student developer"])] }).highlights).toEqual([]);
  });

  it("rejects a bare number or duration, and whole paragraphs", () => {
    expect(run({ entries: [entry("about:0", ["6 years"])] }).highlights).toEqual([]);
    expect(run({ entries: [entry("about:0", [evidence[1]!.text.slice(0, 190)])] }).highlights).toEqual([]);
  });

  it("drops overlapping and duplicate phrases, and never covers most of an item", () => {
    const nested = run({
      entries: [entry("experience:0", ["Led a 4-person web team", "4-person web team", "led a 4-person WEB team"]), entry("experience:0", ["Led a 4-person web team"])],
    });
    expect(quotes(nested)).toEqual(["Led a 4-person web team"]);

    const sentences = evidence[1]!.text.split(". ").map((s) => s.slice(0, 150));
    const dense = run({ entries: [entry("about:0", sentences)] });
    const covered = dense.highlights.reduce((sum, h) => sum + h.quote.length, 0);
    expect(covered).toBeLessThanOrEqual(evidence[1]!.text.length / 2);
  });

  it("limits a short item to a couple of highlights", () => {
    const result = run({ entries: [entry("volunteering:0", ["Completed 60+ hours", "tutoring in Java", "supporting 15+ students"])] });
    expect(result.highlights).toHaveLength(2);
  });
});
