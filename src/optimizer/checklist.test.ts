import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { buildEvidencePayload } from "../ai/evidencePayload";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { CHECKLISTS, evaluateChecklist, evaluateNetwork, evaluateProfileUrl, semanticCriteria, summarizeChecklist, type ChecklistContext, type SemanticState } from "./checklist";
import { buildSectionMap, type OptimizerSection } from "./sections";
import { DETAIL_SECTIONS } from "./sectionGuidance";

const baseShell: ProfileShell = { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} };

function context(section: OptimizerSection, profile: LinkedInProfile, shell: ProfileShell = baseShell, profileKey = "jordan-rivera"): ChecklistContext {
  const evidence = buildEvidencePayload(profile);
  const presence = buildSectionMap(profile, shell, evidence).find((p) => p.section === section) ?? { section, present: true, itemCount: null, evidenceIds: [] };
  return { profile, evidence, presence, shell, profileKey };
}

const status = (section: OptimizerSection, profile: LinkedInProfile, semantic: SemanticState = { status: "idle" }, shell?: ProfileShell) =>
  Object.fromEntries(evaluateChecklist(section, context(section, profile, shell), semantic).map((c) => [c.id, c.status]));

const profile: LinkedInProfile = {
  ...EMPTY_PROFILE,
  headline: "Aspiring Software Engineer | Full-stack web developer",
  about: "I am a high-school senior who has studied software development for nine years. I built a yearbook website used by 300+ students.",
  experience: [
    { title: "Website Developer", company: "School", dates: "May 2026 - Present", description: "Built and maintain the yearbook website serving 300+ students." },
    { title: "Tutor", company: "Code Club", dates: "2024 - 2025" },
  ],
  certifications: [{ name: "AWS Certified Cloud Practitioner", description: "Amazon Web Services · Issued Mar 2026" }, { name: "Python Basics" }],
  languages: [{ name: "English", description: "Native or bilingual proficiency" }, { name: "Spanish" }, { name: "english" }],
  location: "Charlotte, North Carolina, United States",
  extracted: true,
};

describe("every section has its own checklist", () => {
  it("covers all 18 detail pages with section-specific criteria", () => {
    expect(DETAIL_SECTIONS).toHaveLength(18);
    for (const section of DETAIL_SECTIONS) expect(CHECKLISTS[section].length).toBeGreaterThan(1);
    const ids = DETAIL_SECTIONS.flatMap((section) => CHECKLISTS[section].map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("deterministic criteria", () => {
  it("passes what the evidence shows, with profile-specific explanations", () => {
    const results = evaluateChecklist("experience", context("experience", profile), { status: "idle" });
    const metrics = results.find((c) => c.id === "experience-metrics")!;
    expect(metrics).toMatchObject({ status: "pass", verification: "deterministic" });
    expect(metrics.explanation).toContain("300+ students");
    expect(status("certifications", profile)).toMatchObject({ "certifications-named": "pass", "certifications-dates": "improve", "certifications-issuer": "improve" });
  });

  it("flags what is missing, naming the entries concerned", () => {
    const descriptions = evaluateChecklist("experience", context("experience", profile), { status: "idle" }).find((c) => c.id === "experience-descriptions")!;
    expect(descriptions.status).toBe("improve");
    expect(descriptions.explanation).toContain('"Tutor"');
    expect(status("languages", profile)).toMatchObject({ "languages-proficiency": "improve", "languages-unique": "improve" });
    expect(status("headline", { ...profile, headline: "Motivated, hardworking student" })["headline-filler"]).toBe("improve");
    expect(status("headline", { ...profile, headline: "Dev | Web | AI | ML | Cloud | Data" })["headline-separators"]).toBe("improve");
  });

  it("counts a class year or LinkedIn's skill tag as no measurable result", () => {
    const yearOnly = { ...profile, experience: [{ title: "Web Developer", description: "Built the '26 prom website · Web Development, Web Design and +2 skills" }] };
    expect(status("experience", yearOnly)["experience-metrics"]).toBe("improve");
  });

  it("uses no arbitrary length thresholds for the headline or About", () => {
    expect(CHECKLISTS.headline.some((c) => /length/i.test(c.id))).toBe(false);
    expect(CHECKLISTS.about.some((c) => /length/i.test(c.id))).toBe(false);
    expect(status("about", { ...profile, about: "Short." })["about-present"]).toBe("pass");
  });
});

describe("unverifiable criteria", () => {
  it("never claims what it cannot see: images, links, and paragraph breaks", () => {
    expect(status("photo", profile)).toMatchObject({ "photo-present": "pass", "photo-face": "unverifiable", "photo-lighting": "unverifiable", "photo-crop": "unverifiable" });
    expect(status("banner", profile)).toMatchObject({ "banner-custom": "pass", "banner-relevant": "unverifiable", "banner-quality": "unverifiable" });
    expect(status("about", profile)["about-paragraphs"]).toBe("unverifiable");
    expect(status("projects", { ...profile, projects: [{ name: "Yearbook site" }] })["projects-links"]).toBe("unverifiable");
    expect(status("experience", profile)["experience-media"]).toBe("unverifiable");
    for (const section of ["photo", "banner"] as const) expect(CHECKLISTS[section].filter((c) => c.verification === "deterministic")).toHaveLength(1);
  });

  it("never suggests moving, and never requires a credential URL", () => {
    expect(status("location", profile)).toMatchObject({ "location-specific": "pass", "location-target": "unverifiable" });
    expect(status("location", { ...profile, location: "United States" })["location-specific"]).toBe("improve");
    expect(status("certifications", profile)["certifications-credential"]).toBe("unverifiable");
  });
});

describe("LinkedIn URL", () => {
  it("recognizes LinkedIn's generated suffix and passes a custom URL", () => {
    expect(evaluateProfileUrl("jordan-rivera")).toMatchObject({ custom: { status: "pass" }, readable: { status: "pass" } });
    expect(evaluateProfileUrl("jordan-rivera-834725198")).toMatchObject({ custom: { status: "improve" }, readable: { status: "improve" } });
    expect(evaluateProfileUrl("pablo-robles-a804a7327")!.custom.explanation).toContain('"a804a7327"');
    expect(evaluateProfileUrl("jrivera42")).toMatchObject({ custom: { status: "pass" }, readable: { status: "pass" } });
    expect(evaluateProfileUrl(null)).toBeNull();
  });
});

describe("Open to Work", () => {
  it("reports only what the page shows, and never guesses recruiter-only settings", () => {
    expect(status("openToWork", profile, undefined, { ...baseShell, openToWork: "shown" })).toMatchObject({ "otw-status": "pass", "otw-recruiters": "unverifiable", "otw-roles": "unverifiable" });
    expect(status("openToWork", profile, undefined, { ...baseShell, openToWork: "not_shown" })["otw-status"]).toBe("not_applicable");
    expect(status("openToWork", profile, undefined, { ...baseShell, openToWork: null })["otw-status"]).toBe("unverifiable");
    const results = evaluateChecklist("openToWork", context("openToWork", profile, { ...baseShell, openToWork: "not_shown" }), { status: "idle" });
    expect(summarizeChecklist(true, results)).toMatchObject({ verifiable: 0, state: null });
  });
});

describe("Network", () => {
  it("reads the count in context, without a hard cut-off at 500", () => {
    expect(evaluateNetwork("500+", 921)).toMatchObject({ status: "pass", explanation: "Your profile shows 500+ connections and 921 followers." });
    expect(evaluateNetwork("499").status).toBe("pass");
    expect(evaluateNetwork("40")).toMatchObject({ status: "improve" });
    expect(evaluateNetwork("40").explanation).not.toMatch(/\d{3}/);
    expect(evaluateNetwork(null).status).toBe("unverifiable");
  });
});

describe("semantic criteria", () => {
  const results: SemanticState = {
    status: "ready",
    results: [
      { criterionId: "about-who", status: "pass", explanation: "Your About section says you have studied software development for nine years.", evidenceIds: ["about:0"] },
      { criterionId: "about-evidence", status: "improve", explanation: "Your About section mentions the yearbook website but not what came of it.", evidenceIds: ["about:0"] },
    ],
  };

  it("shows each AI verdict against its own criterion", () => {
    const evaluated = evaluateChecklist("about", context("about", profile), results);
    expect(evaluated.find((c) => c.id === "about-who")).toMatchObject({ status: "pass", verification: "semantic", evidenceIds: ["about:0"] });
    expect(evaluated.find((c) => c.id === "about-evidence")!.status).toBe("improve");
  });

  it("marks criteria the AI couldn't assess as unverifiable rather than guessing", () => {
    expect(status("about", profile, results)["about-differentiator"]).toBe("unverifiable");
    expect(status("about", profile, { status: "unavailable", reason: "timeout" })["about-who"]).toBe("unverifiable");
    expect(status("about", profile)["about-who"]).toBe("checking");
  });
});

describe("summarizeChecklist", () => {
  it("counts only verifiable criteria and derives the section state from them", () => {
    expect(summarizeChecklist(true, evaluateChecklist("photo", context("photo", profile), { status: "idle" }))).toEqual({ state: "strong", passed: 1, verifiable: 1, checking: false });
    const about = evaluateChecklist("about", context("about", profile), {
      status: "ready",
      results: semanticCriteria("about").map((c, i) => ({ criterionId: c.id, status: i < 3 ? "pass" : "improve", explanation: "Your About section mentions Python.", evidenceIds: [] })),
    });
    expect(summarizeChecklist(true, about)).toMatchObject({ state: "improve", passed: 4, verifiable: 9 });
    expect(about.filter((c) => c.status === "unverifiable")).toHaveLength(1);
  });

  it("waits for the AI before calling a section strong, but reports improvements right away", () => {
    expect(summarizeChecklist(true, evaluateChecklist("headline", context("headline", profile), { status: "loading" }))).toMatchObject({ state: null, checking: true });
    expect(summarizeChecklist(true, evaluateChecklist("headline", context("headline", { ...profile, headline: "Passionate student" }), { status: "loading" })).state).toBe("improve");
  });

  it("reports a missing section as missing", () => {
    expect(summarizeChecklist(false, [])).toMatchObject({ state: "missing" });
  });
});
