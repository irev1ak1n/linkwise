import { describe, expect, it } from "vitest";
import type { Grades } from "../ai/signalTypes";
import { DEFAULT_HIGHLIGHT_PREFERENCES, HIGHLIGHT_CATEGORIES, isMeaningfulMetric, migrateLegacyColors, phraseCategory, resetHighlightStyles } from "./highlightCategories";
import { skillTerms, skillsIn } from "./skillTerms";

const NONE: Grades = { impact: 0, ownership: 0, result: 0, scale: 0, selectivity: 0, leadership: 0, technicalDepth: 0, sustainedDepth: 0, specificity: 1, distinctiveness: 0, genericness: 0 };
const g = (patch: Partial<Grades>): Grades => ({ ...NONE, ...patch });

describe("phraseCategory", () => {
  it("styles each kind of evidence by what it is", () => {
    expect(phraseCategory({ type: "competition_result", grades: g({ selectivity: 3, result: 2 }) })).toBe("achievements");
    expect(phraseCategory({ type: "credential", grades: g({ result: 2 }) })).toBe("achievements");
    expect(phraseCategory({ type: "measurable_impact", grades: g({ impact: 2, scale: 3 }) })).toBe("impact");
    expect(phraseCategory({ type: "leadership_scope", grades: g({ leadership: 3 }) })).toBe("leadership");
    expect(phraseCategory({ type: "technical_execution", grades: g({ ownership: 3, technicalDepth: 3 }) })).toBe("projects");
  });

  it("falls back on the grades when the type does not say", () => {
    expect(phraseCategory({ type: "responsibility", grades: g({ leadership: 2 }) })).toBe("leadership");
    expect(phraseCategory({ type: "other", grades: g({ result: 2 }) })).toBe("impact");
    expect(phraseCategory({ type: "other", grades: g({ ownership: 2, technicalDepth: 1 }) })).toBe("projects");
  });

  it("never calls a plain membership leadership", () => {
    expect(phraseCategory({ type: "membership", grades: g({ selectivity: 1 }) })).not.toBe("leadership");
  });
});

describe("highlight preferences", () => {
  it("resets styles to the defaults", () => {
    expect(resetHighlightStyles()).toEqual(DEFAULT_HIGHLIGHT_PREFERENCES);
  });

  it("migrates without giving two categories the same color", () => {
    for (const legacy of ["yellow", "purple", "mint", "orange"]) {
      const colors = HIGHLIGHT_CATEGORIES.map((c) => migrateLegacyColors(legacy, undefined).categories[c].color);
      expect(new Set(colors).size).toBe(colors.length);
    }
  });
});

describe("skill terms", () => {
  it("uses listed skills without LinkedIn's parentheses, plus well-known tools", () => {
    const terms = skillTerms(["Python (Programming Language)", "Customer Service"]);
    expect(terms).toContain("Python");
    expect(terms).toContain("React");
    expect(terms).not.toContain("Python (Programming Language)");
  });

  it("finds whole terms only: C++ is not C, and React is not Reactive", () => {
    const terms = skillTerms(["C"]);
    expect(skillsIn("Wrote C++ and C# tools in a Reactive style", terms)).toEqual(["C++", "C#"]);
    expect(skillsIn("Taught C and Python", terms)).toEqual(["C", "Python"]);
  });

  it("skips ambiguous words unless the person lists them", () => {
    expect(skillsIn("Go to market with Excel", skillTerms([]))).toEqual([]);
    expect(skillsIn("Built tools in Go", skillTerms(["Go"]))).toEqual(["Go"]);
  });

  it("never treats spoken languages as skills", () => {
    expect(skillsIn("Speaks Russian and English", skillTerms([]))).toEqual([]);
  });
});

describe("meaningful numbers", () => {
  it("keeps measured values and drops years and grade levels", () => {
    expect(isMeaningfulMetric("Reached 500+ people through the website", "500+ people")).toBe(true);
    expect(isMeaningfulMetric("Earned 2nd place at Regionals", "2nd place")).toBe(true);
    expect(isMeaningfulMetric("maintained the website for '26 school's prom", "26 school")).toBe(false);
    expect(isMeaningfulMetric("TSA member since 11th grade", "11th")).toBe(false);
    expect(isMeaningfulMetric("Founded in 2026", "2026")).toBe(false);
  });
});
