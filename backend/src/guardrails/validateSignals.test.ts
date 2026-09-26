import { describe, expect, it } from "vitest";
import { findGroundedText, validateSignals, MAX_FACTS, MAX_SIGNALS, type EvidenceText } from "./validateSignals";
import type { ProfileSignal } from "../openai/signalsSchema";

const evidence: EvidenceText[] = [
  {
    id: "experience:0",
    section: "experience",
    text: "Web Lead — Robotics Club — Led a 4-person web team. Helped the project earn 3rd place at the State Conference and reached 300+ visitors.",
  },
  { id: "about:0", section: "about", text: "I am passionate about technology and love learning new things every day." },
  { id: "volunteering:0", section: "volunteering", text: "Tutor — Completed 60+ hours of tutoring in Java, supporting 15+ students" },
];

function signal(overrides: Partial<ProfileSignal> = {}): ProfileSignal {
  return {
    evidenceId: "experience:0",
    quote: "Led a 4-person web team",
    type: "leadership",
    strength: "strong",
    importance: 0.9,
    facts: [{ text: "Led 4-person web team", metric: "4-person" }],
    ...overrides,
  };
}

describe("findGroundedText", () => {
  it("returns the original substring despite whitespace, case, and dash differences", () => {
    expect(findGroundedText("Reached  300+ visitors – fast", "reached 300+ visitors - fast")).toBe("Reached  300+ visitors – fast");
  });

  it("returns null when the text is not present", () => {
    expect(findGroundedText("Led a team", "Led a 10-person team")).toBeNull();
  });
});

describe("validateSignals", () => {
  it("keeps a grounded quantified signal with its metric and fact", () => {
    const result = validateSignals({ signals: [signal()] }, evidence);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({ section: "experience", quote: "Led a 4-person web team", metrics: ["4-person"] });
    expect(result.facts).toEqual([{ text: "Led 4-person web team", evidenceId: "experience:0" }]);
  });

  it("keeps non-quantified leadership evidence without a metric", () => {
    const result = validateSignals({ signals: [signal({ quote: "Web Lead", facts: [{ text: "Web Lead", metric: null }] })] }, evidence);
    expect(result.signals[0]!.metrics).toEqual([]);
    expect(result.facts[0]!.text).toBe("Web Lead");
  });

  it("rejects a quote that does not exist in the evidence", () => {
    const result = validateSignals({ signals: [signal({ quote: "Led a 12-person web team" })] }, evidence);
    expect(result.signals).toHaveLength(0);
  });

  it("rejects an unknown evidence id", () => {
    const result = validateSignals({ signals: [signal({ evidenceId: "experience:9" })] }, evidence);
    expect(result.signals).toHaveLength(0);
  });

  it("rejects a quote from a different evidence item", () => {
    const result = validateSignals({ signals: [signal({ evidenceId: "about:0" })] }, evidence);
    expect(result.signals).toHaveLength(0);
  });

  it("rejects importance outside 0 to 1", () => {
    expect(validateSignals({ signals: [signal({ importance: 1.4 })] }, evidence).signals).toHaveLength(0);
    expect(validateSignals({ signals: [signal({ importance: -0.2 })] }, evidence).signals).toHaveLength(0);
    expect(validateSignals({ signals: [signal({ importance: Number.NaN })] }, evidence).signals).toHaveLength(0);
  });

  it("excludes low-importance and claim-only signals", () => {
    const lowSignal = signal({ evidenceId: "about:0", quote: "passionate about technology", importance: 0.2, facts: [] });
    const claim = signal({ evidenceId: "about:0", quote: "love learning new things", strength: "claim", importance: 0.8, facts: [] });
    expect(validateSignals({ signals: [lowSignal, claim] }, evidence).signals).toHaveLength(0);
  });

  it("drops a fact whose metric is not in the quote", () => {
    const result = validateSignals({ signals: [signal({ facts: [{ text: "Led web team", metric: "10-person" }] })] }, evidence);
    expect(result.signals[0]!.metrics).toEqual([]);
    expect(result.facts).toEqual([]);
  });

  it("drops a fact that introduces a number absent from the quote", () => {
    const result = validateSignals({ signals: [signal({ facts: [{ text: "Led 12-person team", metric: null }] })] }, evidence);
    expect(result.facts).toEqual([]);
  });

  it("dedupes overlapping signals from the same evidence and merges metrics", () => {
    const wide = signal({
      quote: "Helped the project earn 3rd place at the State Conference and reached 300+ visitors",
      type: "achievement",
      importance: 0.95,
      facts: [{ text: "3rd place at State Conference", metric: "3rd place" }],
    });
    const narrow = signal({ quote: "reached 300+ visitors", type: "audience_scale", importance: 0.7, facts: [{ text: "300+ visitors", metric: "300+" }] });
    const result = validateSignals({ signals: [narrow, wide] }, evidence);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]!.type).toBe("achievement");
    expect(result.signals[0]!.metrics).toEqual(["3rd place", "300+"]);
    expect(result.facts.map((f) => f.text)).toEqual(["3rd place at State Conference", "300+ visitors"]);
  });

  it("dedupes identical facts across signals", () => {
    const a = signal({ evidenceId: "volunteering:0", quote: "Completed 60+ hours of tutoring in Java", facts: [{ text: "60+ tutoring hours", metric: "60+ hours" }] });
    const b = signal({
      evidenceId: "volunteering:0",
      quote: "Completed 60+ hours of tutoring in Java, supporting 15+ students",
      importance: 0.8,
      facts: [{ text: "60+ Tutoring Hours", metric: "60+" }, { text: "15+ students supported", metric: "15+" }],
    });
    const result = validateSignals({ signals: [a, b] }, evidence);
    expect(result.signals).toHaveLength(1);
    expect(result.facts.map((f) => f.text)).toEqual(["60+ tutoring hours", "15+ students supported"]);
  });

  it("returns the canonical profile text, not the model's wording", () => {
    const result = validateSignals({ signals: [signal({ quote: "LED A 4‑PERSON WEB TEAM." })] }, evidence);
    expect(result.signals[0]!.quote).toBe("Led a 4-person web team");
  });

  it("rejects a quote that spans the whole of a long evidence item", () => {
    const long: EvidenceText = { id: "about:1", section: "about", text: "word ".repeat(100).trim() };
    const result = validateSignals({ signals: [signal({ evidenceId: "about:1", quote: long.text, facts: [] })] }, [long]);
    expect(result.signals).toHaveLength(0);
  });

  it("lists quantified facts before unquantified ones and keeps one unquantified fact per signal", () => {
    const items: EvidenceText[] = Array.from({ length: MAX_FACTS + 2 }, (_, i) => ({
      id: `experience:${i}`,
      section: "experience",
      text: `Role ${i} — Led the ${i}-member team and shipped the product`,
    }));
    const signals = items.map((item, i) =>
      signal({
        evidenceId: item.id,
        quote: i === items.length - 1 ? `Led the ${i}-member team` : "shipped the product",
        importance: 0.99 - i / 100,
        facts:
          i === items.length - 1
            ? [{ text: `Led ${i}-member team`, metric: `${i}-member` }]
            : [{ text: `Shipped product ${"x".repeat(i)}`, metric: null }, { text: `Owned delivery ${"y".repeat(i)}`, metric: null }],
      }),
    );
    const facts = validateSignals({ signals }, items).facts.map((f) => f.text);
    expect(facts[0]).toBe(`Led ${items.length - 1}-member team`);
    expect(facts).toHaveLength(MAX_FACTS);
    expect(facts.filter((f) => f.startsWith("Owned delivery"))).toEqual([]);
  });

  it("orders by importance and caps the signal count", () => {
    const many = Array.from({ length: MAX_SIGNALS + 5 }, (_, i) =>
      signal({ evidenceId: `skills:${i}`, quote: "Python", importance: 0.5 + i / 100, facts: [] }),
    );
    const items = many.map((s) => ({ id: s.evidenceId, section: "skills", text: "Python" }));
    const result = validateSignals({ signals: many }, items);
    expect(result.signals).toHaveLength(MAX_SIGNALS);
    expect(result.signals[0]!.importance).toBeGreaterThan(result.signals[1]!.importance);
  });
});
