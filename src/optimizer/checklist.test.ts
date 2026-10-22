import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { buildEvidencePayload } from "../ai/evidencePayload";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { CHECKLISTS, evaluateChecklist, userCriteria, evaluateNetwork, evaluateProfileUrl, semanticCriteria, summarizeChecklist, type ChecklistContext, type SemanticState } from "./checklist";
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
    expect(status("photo", profile)).toMatchObject({ "photo-present": "pass", "photo-face": "needs_user", "photo-lighting": "needs_user", "photo-crop": "needs_user" });
    expect(status("banner", profile)).toMatchObject({ "banner-custom": "pass", "banner-relevant": "needs_user", "banner-headline": "needs_user", "banner-quality": "needs_user", "banner-text": "needs_user" });
    expect(status("about", profile)["about-paragraphs"]).toBe("needs_user");
    expect(status("projects", { ...profile, projects: [{ name: "Yearbook site" }] })["projects-links"]).toBe("needs_user");
    for (const section of ["photo", "banner"] as const) expect(CHECKLISTS[section].filter((c) => c.verification === "deterministic")).toHaveLength(1);
  });

  it("never suggests moving, and never requires a credential URL", () => {
    expect(status("location", profile)).toMatchObject({ "location-specific": "pass", "location-target": "needs_user" });
    expect(status("location", { ...profile, location: "United States" })["location-specific"]).toBe("improve");
    expect(status("certifications", profile)["certifications-credential"]).toBe("needs_user");
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
    expect(status("openToWork", profile, undefined, { ...baseShell, openToWork: "shown" })).toMatchObject({ "otw-status": "pass", "otw-recruiters": "needs_user", "otw-roles": "needs_user" });
    expect(status("openToWork", profile, undefined, { ...baseShell, openToWork: "not_shown" })["otw-status"]).toBe("not_applicable");
    expect(status("openToWork", profile, undefined, { ...baseShell, openToWork: null })["otw-status"]).toBe("needs_user");
    const results = evaluateChecklist("openToWork", context("openToWork", profile, { ...baseShell, openToWork: "not_shown" }), { status: "idle" });
    expect(summarizeChecklist(true, results)).toMatchObject({ verifiable: 0, state: null, needsUser: 2 });
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

  it("asks the user about criteria the AI couldn't assess rather than guessing", () => {
    expect(status("about", profile, results)["about-direction"]).toBe("needs_user");
    expect(status("about", profile, { status: "unavailable", reason: "timeout" })["about-who"]).toBe("needs_user");
    expect(status("about", profile)["about-who"]).toBe("checking");
  });
});

describe("summarizeChecklist", () => {
  it("counts only verifiable criteria and derives the section state from them", () => {
    expect(summarizeChecklist(true, evaluateChecklist("photo", context("photo", profile), { status: "idle" }))).toEqual({ state: "strong", passed: 1, verifiable: 1, checking: false, needsUser: 6 });
    const about = evaluateChecklist("about", context("about", profile), {
      status: "ready",
      results: semanticCriteria("about").map((c, i) => ({ criterionId: c.id, status: i < 3 ? "pass" : "improve", explanation: "Your About section mentions Python.", evidenceIds: [] })),
    });
    expect(summarizeChecklist(true, about)).toMatchObject({ state: "improve", passed: 4, verifiable: 8 });
    expect(about.filter((c) => c.status === "needs_user")).toHaveLength(1);
  });

  it("waits for the AI before calling a section strong, but reports improvements right away", () => {
    expect(summarizeChecklist(true, evaluateChecklist("headline", context("headline", profile), { status: "loading" }))).toMatchObject({ state: null, checking: true });
    expect(summarizeChecklist(true, evaluateChecklist("headline", context("headline", { ...profile, headline: "Passionate student" }), { status: "loading" })).state).toBe("improve");
  });

  it("reports a missing section as missing", () => {
    expect(summarizeChecklist(false, [])).toMatchObject({ state: "missing" });
  });
});

describe("checks only the user can make", () => {
  const photo = (answers: Record<string, boolean> = {}) => evaluateChecklist("photo", { ...context("photo", profile), answers }, { status: "idle" });
  const visualIds = userCriteria("photo").map((c) => c.id);

  it("asks for photo and banner judgments instead of claiming LinkWise can't see them, keeping presence automatic", () => {
    expect(CHECKLISTS.photo.find((c) => c.id === "photo-present")?.verification).toBe("deterministic");
    expect(userCriteria("photo")).toHaveLength(6);
    expect(userCriteria("banner")).toHaveLength(6);
    const text = JSON.stringify(photo()) + JSON.stringify(evaluateChecklist("banner", context("banner", profile), { status: "idle" }));
    expect(text).not.toMatch(/doesn.t analyze|can.t verify|unable to/i);
    for (const criterion of [...userCriteria("photo"), ...userCriteria("banner")]) expect(criterion.advice).toMatch(/^Check that /);
  });

  it("A: unanswered checks need review and never count as failures", () => {
    const criteria = photo();
    expect(criteria.filter((c) => c.status === "needs_user").map((c) => c.id)).toEqual(visualIds);
    expect(criteria.find((c) => c.id === "photo-lighting")).toMatchObject({ userValue: null, explanation: "Check that your face is evenly lit, without heavy shadows." });
    expect(summarizeChecklist(true, criteria)).toMatchObject({ state: "strong", passed: 1, verifiable: 1, needsUser: 6 });
  });

  it("B: confirmed checks pass, credited to the user", () => {
    const criteria = photo(Object.fromEntries(visualIds.map((id) => [id, true])));
    expect(criteria.find((c) => c.id === "photo-lighting")).toMatchObject({ status: "pass", userValue: true, explanation: "Confirmed by you." });
    expect(summarizeChecklist(true, criteria)).toMatchObject({ state: "strong", passed: 7, verifiable: 7, needsUser: 0 });
  });

  it("C: a check marked as needing improvement makes the section need improvement", () => {
    const criteria = photo({ "photo-face": true, "photo-lighting": false });
    expect(criteria.find((c) => c.id === "photo-lighting")).toMatchObject({ status: "improve", userValue: false, explanation: "You marked this as needing improvement." });
    expect(summarizeChecklist(true, criteria)).toMatchObject({ state: "improve", passed: 2, verifiable: 3, needsUser: 4 });
  });
});

describe("section presence", () => {
  it("says how much of a counted list LinkWise read", () => {
    const shell: ProfileShell = { ...baseShell, sections: { skills: 50 } };
    const skills = (n: number) => ({ ...profile, skills: Array.from({ length: n }, (_, i) => `Skill ${i}`) });
    const explain = (p: LinkedInProfile) => evaluateChecklist("skills", context("skills", p, shell), { status: "idle" }).find((c) => c.id === "skills-present")?.explanation;
    expect(explain(skills(50))).toBe("50 of 50 entries read.");
    expect(explain(skills(46))).toBe("46 of 50 entries read.");
  });
});

describe("overrides", () => {
  const withAnswers = (answers: Record<string, boolean>) => evaluateChecklist("location", { ...context("location", profile), answers }, { status: "idle" });

  it("lets the user override a result LinkWise found, keeping the automatic one alongside", () => {
    const [present] = withAnswers({ "location-present": false });
    expect(present).toMatchObject({ id: "location-present", status: "improve", userValue: false, explanation: "You marked this as needing improvement." });
    expect(present!.automatic).toMatchObject({ status: "pass" });
    // Withdrawing the answer returns to what LinkWise found.
    expect(withAnswers({})[0]).toMatchObject({ status: "pass" });
    expect(withAnswers({})[0]!.userValue).toBeUndefined();
    const failing = evaluateChecklist("location", { ...context("location", { ...profile, location: "United States" }), answers: { "location-specific": true } }, { status: "idle" });
    expect(failing.find((c) => c.id === "location-specific")).toMatchObject({ status: "pass", userValue: true, automatic: { status: "improve" } });
  });

  it("never asks a question that sounds like a limitation", () => {
    const text = (["about", "featured", "experience", "projects", "certifications", "location", "openToWork", "network"] as const).flatMap((section) => evaluateChecklist(section, context(section, profile, { ...baseShell, openToWork: null }), { status: "idle" })).map((c) => c.explanation).join(" ");
    expect(text).not.toMatch(/can.t (verify|see|evaluate|judge)|doesn.t (read|know|analyze)|LinkWise (can|doesn)/i);
  });
});

describe("measurable impact", () => {
  const impact = (experience: LinkedInProfile["experience"], answers: Record<string, boolean> = {}) =>
    evaluateChecklist("experience", { ...context("experience", { ...profile, experience }), answers }, { status: "idle" }).find((c) => c.id === "experience-metrics")!;
  const long = (text: string) => ({ title: "Developer", company: "School", description: text });

  it("passes on a number, or on an outcome described in words, and never needs every role to have one", () => {
    expect(impact([long("Built the yearbook website, used by 4,000+ students each month."), { title: "Tutor", company: "Club" }])).toMatchObject({ label: "Measurable outcomes where meaningful", status: "pass" });
    const words = impact([long("Built a dashboard that allowed the adviser to manage yearbook content independently.")]);
    expect(words).toMatchObject({ status: "pass" });
    expect(words.explanation).toContain("what the work led to");
  });

  it("flags duty-only descriptions, asks when there is nothing to judge, and lets the user override either", () => {
    const duties = impact([long("Worked on the website and helped with various tasks for the club.")]);
    expect(duties).toMatchObject({ status: "improve" });
    expect(duties.explanation).toContain("list duties");
    // Nothing described: LinkWise asks instead of marking it down.
    expect(impact([{ title: "Developer", company: "School" }])).toMatchObject({ status: "needs_user" });
    // The user can still overrule a result, in either direction.
    expect(impact([long("Worked on the website and helped with various tasks for the club.")], { "experience-metrics": true })).toMatchObject({ status: "pass", userValue: true });
    expect(impact([long("Built the yearbook website, used by 4,000+ students each month.")], { "experience-metrics": false })).toMatchObject({ status: "improve", userValue: false });
  });

  it("adds the About, Projects and Featured impact checks without making any missing number a failure", () => {
    const ids = (section: "about" | "projects" | "featured") => CHECKLISTS[section].map((c) => c.id);
    expect(ids("about")).toEqual(expect.arrayContaining(["about-evidence", "about-measurable", "about-leadership", "about-connection"]));
    expect(ids("projects")).toEqual(expect.arrayContaining(["projects-audience", "projects-result"]));
    expect(CHECKLISTS.featured.find((c) => c.id === "featured-impact")?.verification).toBe("user");
    // Leadership applies "when supported": the advice tells the AI to pass when there is nothing to show.
    expect(CHECKLISTS.about.find((c) => c.id === "about-leadership")!.advice).toContain("If the evidence shows none, this is met.");
  });
});

describe("quality-focused criteria", () => {
  const ids = (section: Parameters<typeof semanticCriteria>[0]) => semanticCriteria(section).map((c) => c.id);

  it("judge headlines on positioning, proof, stuffing, repetition, and consistency, and Abouts on evidence over adjectives", () => {
    expect(ids("headline")).toEqual(expect.arrayContaining(["headline-direction", "headline-differentiator", "headline-readable", "headline-scan", "headline-consistent"]));
    expect(CHECKLISTS.headline.find((c) => c.id === "headline-readable")?.advice).toMatch(/repeated|restated/);
    expect(ids("about")).toEqual(expect.arrayContaining(["about-who", "about-evidence", "about-measurable", "about-leadership", "about-connection", "about-direction"]));
    expect(CHECKLISTS.about.find((c) => c.id === "about-measurable")?.advice).toMatch(/no number is required/);
  });

  it("credit Experience and Projects for ownership and results, and never for naming many tools", () => {
    expect(ids("experience")).toEqual(expect.arrayContaining(["experience-accomplishments", "experience-ownership", "experience-context", "experience-early"]));
    for (const id of ["experience-technical", "projects-technologies"]) {
      const criterion = [...CHECKLISTS.experience, ...CHECKLISTS.projects].find((c) => c.id === id)!;
      expect(criterion.advice).toMatch(/not credit|is not credit|does not replace/);
    }
    expect(ids("projects")).toEqual(expect.arrayContaining(["projects-purpose", "projects-contribution", "projects-audience", "projects-result"]));
  });

  it("keep the banner checks about identity and the headline, as the user's own visual judgment", () => {
    expect(userCriteria("banner").map((c) => c.id)).toEqual(expect.arrayContaining(["banner-relevant", "banner-headline"]));
  });
});
