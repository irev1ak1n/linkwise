import { describe, expect, it } from "vitest";
import { FALLBACK_HINT, includeHint } from "./generatorHints";

const item = (section: string, index: number, text: string) => ({ id: `${section}:${index}`, section, text, evidenceType: section }) as never;

describe("include hint", () => {
  it("draws from strong projects, results, and leadership in the profile, and never from a fixed example", () => {
    const evidence = [
      item("about", 0, "I studied software development for 9 years of training."),
      item("experience", 0, "Programming Tutor — Learning Club — 2023 – Present — Tutored 15 peers for 150+ hours."),
      item("experience", 1, "Webmaster Team Captain — Robotics Society — 2024 — Led the site."),
      item("experience", 2, "Website Developer — School — Built a site used by 4,000+ students."),
      item("skills", 0, "Python, C++, SQL"),
    ];
    const hint = includeHint(evidence, "about");
    expect(hint).toContain("Robotics Society leadership");
    expect(hint).toContain("4,000+ students");
    expect(hint).toContain("website developer");
    expect(includeHint([item("experience", 0, "Programming Tutor — Learning Club — 2023 – Present — Tutored 15 peers for 150+ hours."), item("about", 0, "x")], "about")).toContain("150+ tutoring hours");
    expect(hint).not.toMatch(/Python|C\+\+|SQL/);
    expect(hint.split(", ").length).toBeLessThanOrEqual(4);
    expect(includeHint(evidence, "headline").startsWith("9 years of training")).toBe(true);
  });

  it("names the role, not the school, when the only organization is a school", () => {
    expect(includeHint([item("experience", 0, "Senior Class President — Westfield High School — 2025"), item("honors", 0, "Dean's List — Westfield High School")], "about")).toContain("senior class president");
  });

  it("uses awards and roles when that is what a profile has, and invents no leadership or numbers", () => {
    const hint = includeHint(
      [item("experience", 0, "Research Assistant — State University — 2024"), item("honors", 0, "Dean's List — State University"), item("certifications", 0, "Data Analytics Certificate — Coursera")],
      "headline",
    );
    expect(hint).toContain("Dean's List");
    expect(hint).not.toMatch(/leadership|\d/);
  });

  it("falls back to a generic hint for a sparse profile, using tool names only when nothing stronger exists", () => {
    expect(includeHint([item("headline", 0, "Student")], "about")).toBe(FALLBACK_HINT);
    expect(includeHint([], "headline")).toBe(FALLBACK_HINT);
    expect(includeHint([item("skills", 0, "Python, SQL")], "about")).toBe("Python, SQL");
  });
});
