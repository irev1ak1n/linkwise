import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { buildEvidencePayload } from "../ai/evidencePayload";
import { CHECKLISTS, evaluateChecklist, semanticCriteria, summarizeChecklist, type ChecklistContext, type SemanticState } from "./checklist";
import { buildSectionMap, type OptimizerSection } from "./sections";

const shell = { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} };

function context(section: OptimizerSection, profile: LinkedInProfile): ChecklistContext {
  const evidence = buildEvidencePayload(profile);
  return { profile, evidence, presence: buildSectionMap(profile, shell, evidence).find((p) => p.section === section)! };
}

const status = (section: OptimizerSection, profile: LinkedInProfile, semantic: SemanticState = { status: "idle" }) =>
  Object.fromEntries(evaluateChecklist(section, context(section, profile), semantic).map((c) => [c.id, c.status]));

const profile: LinkedInProfile = {
  ...EMPTY_PROFILE,
  headline: "Aspiring Software Engineer | Full-stack web developer",
  about: "I am a high-school senior who has studied software development for nine years. I built a yearbook website used by 300+ students and tutored 15 peers in Python. ".repeat(2),
  experience: [
    { title: "Website Developer", company: "School", dates: "May 2026 - Present", description: "Built and maintain the yearbook website serving 300+ students." },
    { title: "Tutor", company: "Code Club", dates: "2024 - 2025" },
  ],
  languages: [{ name: "English", description: "Native or bilingual proficiency" }, { name: "Spanish" }],
  location: "Charlotte, North Carolina, United States",
  extracted: true,
};

describe("deterministic criteria", () => {
  it("passes what the evidence shows, with profile-specific explanations", () => {
    const results = evaluateChecklist("experience", context("experience", profile), { status: "idle" });
    const metrics = results.find((c) => c.id === "experience-metrics")!;
    expect(metrics).toMatchObject({ status: "pass", verification: "deterministic" });
    expect(metrics.explanation).toContain("300+ students");
    const yearOnly = evaluateChecklist("experience", context("experience", { ...profile, experience: [{ title: "Web Developer", description: "Built the '26 prom website · Web Development, Web Design and +2 skills" }] }), { status: "idle" });
    expect(yearOnly.find((c) => c.id === "experience-metrics")!.status).toBe("improve");
    expect(results.find((c) => c.id === "experience-current")!.explanation).toContain("Website Developer");
  });

  it("flags what is missing, naming the entries concerned", () => {
    const results = evaluateChecklist("experience", context("experience", profile), { status: "idle" });
    const descriptions = results.find((c) => c.id === "experience-descriptions")!;
    expect(descriptions.status).toBe("improve");
    expect(descriptions.explanation).toContain('"Tutor"');
    expect(status("languages", profile)["languages-proficiency"]).toBe("improve");
    expect(status("headline", { ...profile, headline: "MOTIVATED HARDWORKING Student" })).toMatchObject({ "headline-capitals": "improve", "headline-filler": "improve", "headline-length": "improve" });
    expect(status("about", { ...profile, about: "Hello, I like computers." })).toMatchObject({ "about-length": "improve", "about-numbers": "improve" });
  });

  it("never claims what it cannot see: images and paragraph breaks stay unverifiable", () => {
    expect(status("photo", profile)).toMatchObject({ "photo-present": "pass", "photo-face": "unverifiable", "photo-solo": "unverifiable" });
    expect(status("banner", profile)).toMatchObject({ "banner-custom": "pass", "banner-relevant": "unverifiable", "banner-quality": "unverifiable" });
    expect(status("about", profile)["about-paragraphs"]).toBe("unverifiable");
    for (const section of ["photo", "banner"] as const) expect(CHECKLISTS[section].filter((c) => c.verification === "deterministic")).toHaveLength(1);
  });
});

describe("semantic criteria", () => {
  const results: SemanticState = {
    status: "ready",
    results: [
      { criterionId: "about-who", status: "pass", explanation: "Your About section says you have studied software development for nine years.", evidenceIds: ["about:0"] },
      { criterionId: "about-accomplishments", status: "improve", explanation: "Your About section mentions the yearbook website but not what came of it.", evidenceIds: ["about:0"] },
    ],
  };

  it("shows each AI verdict against its own criterion", () => {
    const evaluated = evaluateChecklist("about", context("about", profile), results);
    expect(evaluated.find((c) => c.id === "about-who")).toMatchObject({ status: "pass", verification: "semantic", evidenceIds: ["about:0"] });
    expect(evaluated.find((c) => c.id === "about-accomplishments")!.status).toBe("improve");
  });

  it("marks criteria the AI couldn't assess as unverifiable rather than guessing", () => {
    expect(status("about", profile, results)["about-differentiator"]).toBe("unverifiable");
    expect(status("about", profile, { status: "unavailable", reason: "timeout" })["about-who"]).toBe("unverifiable");
    expect(status("about", profile)["about-who"]).toBe("checking");
  });
});

describe("summarizeChecklist", () => {
  it("counts only verifiable criteria and derives the section state from them", () => {
    const evaluated = evaluateChecklist("photo", context("photo", profile), { status: "idle" });
    expect(summarizeChecklist(true, evaluated)).toEqual({ state: "strong", passed: 1, verifiable: 1, checking: false });

    const about = evaluateChecklist("about", context("about", profile), {
      status: "ready",
      results: semanticCriteria("about").map((c, i) => ({ criterionId: c.id, status: i < 3 ? "pass" : "improve", explanation: "Your About section mentions Python.", evidenceIds: [] })),
    });
    const summary = summarizeChecklist(true, about);
    expect(summary).toMatchObject({ state: "improve", passed: 5, verifiable: 8 });
    expect(about.filter((c) => c.status === "unverifiable")).toHaveLength(1);
  });

  it("waits for the AI before calling a section strong, but reports improvements right away", () => {
    const strongSoFar = evaluateChecklist("headline", context("headline", profile), { status: "loading" });
    expect(summarizeChecklist(true, strongSoFar)).toMatchObject({ state: null, checking: true });
    const weak = evaluateChecklist("headline", context("headline", { ...profile, headline: "MOTIVATED STUDENT" }), { status: "loading" });
    expect(summarizeChecklist(true, weak).state).toBe("improve");
  });

  it("reports a missing section as missing, not as a list of failures", () => {
    expect(summarizeChecklist(false, [])).toMatchObject({ state: "missing" });
  });
});
