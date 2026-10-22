import { describe, expect, it } from "vitest";
import { rankEvidence, strongestEvidence } from "./rankEvidence";

const item = (section: string, index: number, text: string) => ({ id: `${section}:${index}`, section, text });

describe("About evidence ranking", () => {
  const evidence = [
    item("languages", 0, "English — Native"),
    item("languages", 1, "Russian — Fluent"),
    item("skills", 0, "Python, C++, C#, JavaScript, SQL, .NET"),
    item("experience", 0, "Website Developer — School — Built a yearbook website used by 4,000+ students."),
    item("experience", 1, "Team Captain — Robotics Club — Led a five-person team to a regional final."),
    item("experience", 2, "Programming Tutor — Learning Club — Taught 15 peers for 150+ hours."),
    item("honors", 0, "Regional Competition — 2nd place"),
    item("education", 0, "Code Academy — Diploma — 9 years of software training"),
  ];

  it("puts measurable impact, projects, and leadership first, and languages and tools last", () => {
    const ranked = rankEvidence(evidence);
    expect(ranked.slice(0, 3).map((e) => e.id).sort()).toEqual(["experience:0", "experience:1", "experience:2"]);
    expect(ranked.findIndex((e) => e.id === "languages:0")).toBeGreaterThan(ranked.findIndex((e) => e.id === "skills:0") - 1);
    const strongest = strongestEvidence(evidence).map((e) => e.section);
    expect(strongest).not.toContain("languages");
    expect(strongest).not.toContain("skills");
    expect(strongest.length).toBeGreaterThanOrEqual(4);
  });

  it("lets languages lead when the person's direction is about them", () => {
    const translator = [item("headline", 0, "Translator and interpreter"), item("languages", 0, "Spanish — Fluent"), item("skills", 0, "Excel")];
    expect(rankEvidence(translator)[0]!.id).toBe("languages:0");
  });
});
