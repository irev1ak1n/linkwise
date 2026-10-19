import { describe, expect, it } from "vitest";
import { extractMetrics, findGroundedText, isVagueFact, validateClassification, MAX_FACTS_PER_ITEM, type EvidenceText } from "./validateSignals";
import type { EvidenceFact, SignalClassification } from "../openai/signalsSchema";

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

function grade(quote: string, overrides: Partial<EvidenceFact> = {}): EvidenceFact {
  return {
    quote,
    fact: quote,
    type: "other",
    impact: 1,
    ownership: 1,
    result: 0,
    scale: 0,
    selectivity: 0,
    leadership: 0,
    technicalDepth: 0,
    sustainedDepth: 0,
    specificity: 1,
    distinctiveness: 1,
    goalRelevance: 0,
    genericness: 0,
    confidence: 0.9,
    ...overrides,
  };
}

function run(items: SignalClassification["items"], submitted: EvidenceText[] = evidence) {
  return validateClassification({ careerStage: "student", items }, submitted);
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

  it("ignores a year written as '26 and a grade level like 11th grade", () => {
    expect(extractMetrics("maintained the website for '26 school's prom")).toEqual([]);
    expect(extractMetrics("TSA member since 11th grade, placed 2nd at States")).toEqual(["2nd"]);
  });

  it("ignores years, date ranges, and bare numbers", () => {
    expect(extractMetrics("In 2024, I earned")).toEqual([]);
    expect(extractMetrics("Sep 2021 - Jun 2025")).toEqual([]);
    expect(extractMetrics("students aged 17 and older")).toEqual([]);
  });
});

describe("isVagueFact", () => {
  it("flags category labels standing in for a fact", () => {
    for (const text of ["Web team size", "State Conference result", "Tutoring hours delivered", "Programming experience", "Audience range"]) {
      expect(isVagueFact(text)).toBe(true);
    }
    expect(isVagueFact("3rd place at the State Conference")).toBe(false);
  });
});

describe("validateClassification", () => {
  it("keeps grounded facts as exact source text, with their grades and metrics", () => {
    const result = run([{ evidenceId: "experience:0", facts: [grade("earn 3rd place at the state conference", { type: "competition_result", selectivity: 3, fact: "3rd place at the State Conference" })] }]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        evidenceId: "experience:0",
        section: "experience",
        quote: "earn 3rd place at the State Conference",
        fact: "3rd place at the State Conference",
        type: "competition_result",
        metrics: ["3rd place"],
      }),
    ]);
    expect(result.candidates[0]!.grades.selectivity).toBe(3);
    expect(result.careerStage).toBe("student");
  });

  it("clamps grades to 0-3 integers and confidence to 0-1", () => {
    const [candidate] = run([{ evidenceId: "experience:0", facts: [grade("Led a 4-person web team", { leadership: 9, impact: -2, scale: 1.6, goalRelevance: 7, confidence: 3 })] }]).candidates;
    expect(candidate!.grades.leadership).toBe(3);
    expect(candidate!.grades.impact).toBe(0);
    expect(candidate!.grades.scale).toBe(2);
    expect(candidate!.goalRelevance).toBe(3);
    expect(candidate!.confidence).toBe(1);
  });

  it("rejects unknown items, paraphrased quotes, titles, and bare numbers", () => {
    const result = run([
      { evidenceId: "missing:3", facts: [grade("Led a 4-person web team")] },
      { evidenceId: "experience:0", facts: [grade("Led a four person web team"), grade("Web Lead"), grade("Robotics Club"), grade("300+")] },
      { evidenceId: "headline:0", facts: [grade("Student developer and tutor")] },
    ]);
    expect(result.candidates).toEqual([]);
  });

  it("drops scale and sustained depth the phrase never states", () => {
    const result = run([
      { evidenceId: "experience:0", facts: [grade("Led a 4-person web team", { scale: 3, sustainedDepth: 2 }), grade("reached 300+ visitors", { scale: 3 })] },
      { evidenceId: "volunteering:0", facts: [grade("Completed 60+ hours of tutoring in Java", { sustainedDepth: 2 })] },
    ]);
    const grades = Object.fromEntries(result.candidates.map((c) => [c.quote, c.grades]));
    expect(grades["Led a 4-person web team"]).toMatchObject({ scale: 3, sustainedDepth: 0 });
    expect(grades["reached 300+ visitors"]).toMatchObject({ scale: 3 });
    expect(grades["Completed 60+ hours of tutoring in Java"]).toMatchObject({ sustainedDepth: 2 });
  });

  it("rejects a phrase that only describes the setting of a fact", () => {
    const result = run([{ evidenceId: "experience:0", facts: [grade("at the State Conference"), grade("earn 3rd place at the State Conference")] }]);
    expect(result.candidates.map((c) => c.quote)).toEqual(["earn 3rd place at the State Conference"]);
  });

  it("drops a fact line that names numbers or names its item never states, but keeps the quote", () => {
    const [candidate] = run([{ evidenceId: "experience:0", facts: [grade("Led a 4-person web team", { fact: "Led a 40-person team at Google" })] }]).candidates;
    expect(candidate!.quote).toBe("Led a 4-person web team");
    expect(candidate!.fact).toBeNull();
  });

  it("keeps only the lead-in of a long list", () => {
    const text = "Courses — Northfield High — Took AP Computer Science, AP Calculus, AP Physics, AP Statistics, AP Chemistry, AP Biology, AP Literature, AP History";
    const submitted = [{ id: "education:0", section: "education", text }];
    const [candidate] = run([{ evidenceId: "education:0", facts: [grade("Took AP Computer Science, AP Calculus, AP Physics, AP Statistics, AP Chemistry, AP Biology, AP Literature, AP History")] }], submitted).candidates;
    expect(candidate!.quote).toBe("Took AP Computer Science, AP Calculus, AP Physics, AP Statistics");
  });

  it("removes duplicate quotes, caps facts per item, and keeps reading order", () => {
    const sentences = evidence[1]!.text.split(". ").map((s) => s.slice(0, 150));
    const result = run([{ evidenceId: "about:0", facts: [...sentences.reverse(), sentences[0]!].map((s) => grade(s)) }]);
    expect(result.candidates.length).toBeLessThanOrEqual(MAX_FACTS_PER_ITEM);
    const positions = result.candidates.map((c) => evidence[1]!.text.indexOf(c.quote));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(result.candidates.map((c) => c.quote)).size).toBe(result.candidates.length);
  });

  it("counts every submitted item as graded, even when nothing in it was worth a fact", () => {
    expect(run([]).classified).toEqual(evidence.map((item) => item.id));
  });
});
