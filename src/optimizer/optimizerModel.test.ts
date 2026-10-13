import { describe, expect, it } from "vitest";
import { buildSectionMap, OPTIMIZER_SECTIONS, type SectionPresence } from "./sections";
import { computeOptimizerScore } from "./score";
import { buildEvidencePayload } from "../ai/evidencePayload";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import type { SectionAssessmentDTO } from "./optimizerTypes";

const profile: LinkedInProfile = {
  ...EMPTY_PROFILE,
  name: "Jordan Rivera",
  headline: "Student developer",
  about: "Builds websites for student clubs.",
  experience: [{ title: "Web Lead", company: "Robotics Club", description: "Led a 4-person web team" }],
  education: [{ school: "State University" }],
  skills: ["Python"],
  certifications: [],
  extracted: true,
};

describe("buildSectionMap", () => {
  it("marks each section present or missing from the page and the collected evidence", () => {
    const shell = { isOwnProfile: true, hasPhoto: true, hasBanner: false, sections: { about: null, experience: null, skills: 50, certifications: 2 } };
    const map = buildSectionMap(profile, shell, buildEvidencePayload(profile));
    const of = (section: string) => map.find((p) => p.section === section)!;
    expect(of("photo").present).toBe(true);
    expect(of("banner").present).toBe(false);
    expect(of("featured").present).toBe(false);
    expect(of("projects").present).toBe(false);
    expect(of("skills")).toMatchObject({ present: true, itemCount: 50 });
    expect(of("certifications")).toMatchObject({ present: true, itemCount: 2, evidenceIds: [] });
    expect(of("education")).toMatchObject({ present: true, itemCount: 1, evidenceIds: ["education:0"] });
    expect(of("experience").evidenceIds).toEqual(["experience:0"]);
    expect(map).toHaveLength(OPTIMIZER_SECTIONS.length);
  });
});

function presence(present: string[]): SectionPresence[] {
  return OPTIMIZER_SECTIONS.map(({ section }) => ({ section, present: present.includes(section), itemCount: null, evidenceIds: [] }));
}

function assessment(section: string, state: SectionAssessmentDTO["state"], impact: SectionAssessmentDTO["impact"] = "medium"): SectionAssessmentDTO {
  return { section: section as SectionAssessmentDTO["section"], state, impact, reason: "", sourceType: "linkedin_profile", evidenceIds: [], suggestions: [] };
}

const CORE = ["photo", "headline", "about", "experience", "education", "skills"];

describe("computeOptimizerScore", () => {
  it("is deterministic and reaches 100 only when every counted section is strong", () => {
    const strong = CORE.map((s) => assessment(s, "strong"));
    expect(computeOptimizerScore(presence(CORE), strong)).toBe(100);
    expect(computeOptimizerScore(presence(CORE), strong)).toBe(computeOptimizerScore(presence(CORE), strong));
  });

  it("does not punish a profile for optional sections it does not need", () => {
    const strong = CORE.map((s) => assessment(s, "strong"));
    const withOptionalAdvice = [...strong, assessment("projects", "add", "medium"), assessment("volunteering", "add", "low")];
    expect(computeOptimizerScore(presence(CORE), withOptionalAdvice)).toBe(100);
  });

  it("counts a missing optional section only when adding it would matter a lot", () => {
    const strong = CORE.map((s) => assessment(s, "strong"));
    const score = computeOptimizerScore(presence(CORE), [...strong, assessment("featured", "add", "high")]);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(90);
  });

  it("drops sharply when a core section is missing, and less for an improvement", () => {
    const allButAbout = CORE.filter((s) => s !== "about");
    const missingAbout = computeOptimizerScore(presence(allButAbout), allButAbout.map((s) => assessment(s, "strong")));
    const weakAbout = computeOptimizerScore(presence(CORE), [...allButAbout.map((s) => assessment(s, "strong")), assessment("about", "improve", "high")]);
    const okAbout = computeOptimizerScore(presence(CORE), [...allButAbout.map((s) => assessment(s, "strong")), assessment("about", "improve", "low")]);
    expect(missingAbout).toBeLessThan(weakAbout);
    expect(weakAbout).toBeLessThan(okAbout);
    expect(okAbout).toBeLessThan(100);
  });
});
