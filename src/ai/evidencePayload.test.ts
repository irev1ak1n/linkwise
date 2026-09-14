import { describe, expect, it } from "vitest";
import { buildEvidencePayload, findEvidenceId } from "./evidencePayload";
import type { LinkedInProfile } from "../models/profile";

function profile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
  return {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    organizations: [],
    volunteering: [],
    languages: [],
    extracted: true,
    ...overrides,
  };
}

describe("buildEvidencePayload", () => {
  it("assigns section-scoped, zero-based, stable IDs matching the mission's own example scheme", () => {
    const p = profile({
      headline: "Senior Software Engineer",
      experience: [
        { title: "Software Engineer", company: "Acme" },
        { title: "Intern", company: "Beta" },
      ],
      education: [{ school: "State University", degree: "B.S. Computer Science" }],
      skills: ["Python", "React"],
    });
    const payload = buildEvidencePayload(p);
    expect(payload.map((e) => e.id)).toEqual(["headline:0", "experience:0", "experience:1", "education:0", "skills:0"]);
  });

  it("gives every item an evidenceType equal to its section", () => {
    const p = profile({ headline: "Engineer" });
    const payload = buildEvidencePayload(p);
    expect(payload[0]).toMatchObject({ section: "headline", evidenceType: "headline" });
  });

  it("produces no items for an empty profile", () => {
    expect(buildEvidencePayload(profile({}))).toEqual([]);
  });

  it("is deterministic across repeated calls with the same profile", () => {
    const p = profile({ headline: "A", about: "B", skills: ["C"] });
    expect(buildEvidencePayload(p)).toEqual(buildEvidencePayload(p));
  });
});

describe("findEvidenceId", () => {
  it("finds the id for an exact (untruncated) snippet", () => {
    const p = profile({ about: "I build robots and mentor students." });
    const payload = buildEvidencePayload(p);
    expect(findEvidenceId(payload, "about", "I build robots and mentor students.")).toBe("about:0");
  });

  it("finds the id for a snippet with a trailing ellipsis", () => {
    const p = profile({ about: "I build robots and mentor students in FIRST Robotics." });
    const payload = buildEvidencePayload(p);
    expect(findEvidenceId(payload, "about", "I build robots and mentor students…")).toBe("about:0");
  });

  it("finds the id for a snippet with both leading and trailing ellipses (middle truncation)", () => {
    const longText = `${"padding ".repeat(30)}mentor students${" padding".repeat(30)}`;
    const p = profile({ about: longText });
    const payload = buildEvidencePayload(p);
    expect(findEvidenceId(payload, "about", "…mentor students…")).toBe("about:0");
  });

  it("returns undefined when no field in that section contains the snippet", () => {
    const p = profile({ about: "Unrelated text." });
    const payload = buildEvidencePayload(p);
    expect(findEvidenceId(payload, "about", "something else entirely")).toBeUndefined();
  });

  it("never matches across a different section even with identical text", () => {
    const p = profile({ headline: "Robotics", skills: ["Robotics"] });
    const payload = buildEvidencePayload(p);
    expect(findEvidenceId(payload, "education", "Robotics")).toBeUndefined();
  });
});
