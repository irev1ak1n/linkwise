import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getOptimizerPage, neighborSections, openOptimizerPage } from "./optimizerNav";
import { SectionCards, SectionPage, reconcileAssessments, sectionStatus, summaryText, type SectionContext } from "./SectionPages";
import { SECTION_GUIDANCE, DETAIL_SECTIONS, DOCUMENTED_NUMBERS } from "./sectionGuidance";
import { SECTION_GROUPS } from "./sections";
import { EMPTY_PROFILE } from "../models/profile";
import type { ProfileShell } from "../linkedin/profileAdapter";

const shell = (hasPhoto: boolean, hasBanner: boolean, extra: Partial<ProfileShell> = {}): ProfileShell => ({ isOwnProfile: true, hasPhoto, hasBanner, sections: {}, ...extra });
const context = (overrides: Partial<SectionContext> = {}): SectionContext => ({
  profileKey: "jordan-rivera",
  shell: shell(true, false, { connections: "500+", openToWork: "not_shown" }),
  profile: { ...EMPTY_PROFILE, headline: "Student developer", extracted: true },
  body: null,
  overall: [],
  ...overrides,
});
const overall = (section: "headline" | "featured", state: "strong" | "improve" | "add", impact: "high" | "medium" | "low" = "medium") => ({
  section,
  state,
  impact,
  reason: "",
  sourceType: "linkedin_profile" as const,
  evidenceIds: [],
  suggestions: [],
});

afterEach(() => openOptimizerPage({ name: "home" }));

describe("optimizer navigation", () => {
  it("follows the overview's grouped order through all 18 pages", () => {
    expect(DETAIL_SECTIONS).toEqual(SECTION_GROUPS.flatMap((g) => g.sections));
    expect(DETAIL_SECTIONS).toHaveLength(18);
    const walked = [DETAIL_SECTIONS[0]!];
    for (let next = neighborSections(walked[0]!).next; next; next = neighborSections(next).next) walked.push(next);
    expect(walked).toEqual(DETAIL_SECTIONS);
    expect(neighborSections("photo").prev).toBeNull();
    expect(neighborSections("network")).toEqual({ prev: "openToWork", next: null });
  });

  it("opens a section page and returns to All", () => {
    openOptimizerPage({ name: "section", section: "url" });
    expect(getOptimizerPage()).toEqual({ name: "section", section: "url" });
    openOptimizerPage({ name: "home" });
    expect(getOptimizerPage()).toEqual({ name: "home" });
  });
});

describe("every overview item has a detail page", () => {
  it("lists all 18 in three groups", () => {
    const html = renderToStaticMarkup(<SectionCards context={context()} />);
    expect(html.match(/class="lw-opt-card"/g)).toHaveLength(18);
    for (const group of SECTION_GROUPS) expect(html).toContain(group.title.replace("&", "&amp;"));
  });

  it("gives each one a title, status, checklist, guidance, navigation, and actions", () => {
    DETAIL_SECTIONS.forEach((section, index) => {
      const html = renderToStaticMarkup(<SectionPage section={section} context={context()} />);
      expect(html).toContain("← Back to All");
      expect(html).toContain(`${index + 1} / 18`);
      expect(html).toContain(`<h3 class="lw-od-title">${SECTION_GUIDANCE[section].title.replace("&", "&amp;")}</h3>`);
      expect(html).toContain('aria-label="Checklist"');
      expect(html).toContain("How to improve");
      expect(html).toContain("lw-od-check ");
      expect(html).toContain('<footer class="lw-od-actions">');
      expect(html).not.toContain("☐");
    });
  });

  it("puts the action bar last, in the page flow, so it never hides content", () => {
    const html = renderToStaticMarkup(<SectionPage section="experience" context={context()} />);
    expect(html.trimEnd().endsWith("</footer></article>")).toBe(true);
  });
});

describe("section assessment", () => {
  it("renders evaluated rows and counts only verifiable checks", () => {
    const html = renderToStaticMarkup(<SectionPage section="photo" context={context()} />);
    expect(html).toContain('aria-label="Profile photo added: Meets criterion"');
    expect(html).toContain('aria-label="Face is clear and easy to see: Can&#x27;t verify automatically"');
    expect(html).toContain("1 of 1 verifiable checks passed");
    expect(html).toContain("Looking Good");
  });

  it("shows a missing section as one row, not a wall of failures", () => {
    const html = renderToStaticMarkup(<SectionPage section="featured" context={context({ overall: [overall("featured", "add", "high")] })} />);
    expect(html).toContain("Missing");
    expect(html).toContain("High impact");
    expect(html.match(/class="lw-od-check /g)).toHaveLength(1);
    expect(html).toContain("Featured is not on your profile");
    expect(html).toContain(SECTION_GUIDANCE.featured.missing);
    expect(html).toContain("Add on LinkedIn");
  });

  it("evaluates the discoverability settings from the page", () => {
    expect(renderToStaticMarkup(<SectionPage section="network" context={context()} />)).toContain("Your profile shows 500+ connections.");
    const otw = renderToStaticMarkup(<SectionPage section="openToWork" context={context()} />);
    expect(otw).toContain("Can&#x27;t verify recruiter-only Open to Work settings");
    expect(otw).toContain('aria-label="Open to Work status: Not applicable"');
    expect(renderToStaticMarkup(<SectionPage section="url" context={context()} />)).toContain("linkedin.com/in/jordan-rivera");
  });
});

describe("partly read lists", () => {
  it("says the AI checks can't judge the full list instead of failing them", () => {
    const profile = { ...EMPTY_PROFILE, skills: ["Customer Service", "Tutoring"], extracted: true };
    const body = {
      profile: { identity: "me", evidence: [{ id: "skills:0", section: "skills" as const, text: "Customer Service, Tutoring", evidenceType: "skills" }] },
      sections: [{ section: "skills" as const, present: true, itemCount: 50, evidenceIds: ["skills:0"] }],
      userContext: "",
    };
    const html = renderToStaticMarkup(<SectionPage section="skills" context={context({ profile, body })} />);
    expect(html).toContain("LinkWise read only 2 of your 50 entries here");
    expect(html).not.toContain("Needs improvement");
  });
});

describe("overview and detail agree", () => {
  it("takes the overview's state from the detail checklist", () => {
    const ctx = context({ profile: { ...EMPTY_PROFILE, headline: "Passionate, motivated student", extracted: true }, overall: [overall("headline", "strong", "low")] });
    expect(sectionStatus("headline", ctx)).toBe("improve");
    expect(reconcileAssessments(ctx)[0]).toMatchObject({ section: "headline", state: "improve" });
    expect(renderToStaticMarkup(<SectionPage section="headline" context={ctx} />)).toContain("Needs Improvement");
  });

  it("keeps the review's state while the detail checks are still pending", () => {
    const ctx = context({ profile: { ...EMPTY_PROFILE, headline: "Aspiring Software Engineer building web apps", extracted: true }, overall: [overall("headline", "strong", "low")] });
    expect(sectionStatus("headline", ctx)).toBe("strong");
    expect(reconcileAssessments(ctx)[0]!.state).toBe("strong");
  });
});

describe("static guidance", () => {
  it("is short, actionable, and sourced", () => {
    for (const guidance of Object.values(SECTION_GUIDANCE)) {
      expect(guidance.howToImprove.length).toBeGreaterThanOrEqual(1);
      expect(guidance.howToImprove.length).toBeLessThanOrEqual(6);
      for (const tip of guidance.howToImprove) expect(tip.length).toBeLessThan(110);
      expect(guidance.sources.length).toBeGreaterThan(0);
    }
  });

  it("uses no numbers except ones LinkedIn documents", () => {
    let text = JSON.stringify(Object.values(SECTION_GUIDANCE).map(({ sources: _sources, ...rest }) => rest));
    for (const number of DOCUMENTED_NUMBERS) text = text.split(number).join("");
    expect(text).not.toMatch(/\d/);
  });

  it("never recommends discontinued Skill Assessments or the public Open to Work frame as a default", () => {
    const text = JSON.stringify(SECTION_GUIDANCE).toLowerCase();
    expect(text).not.toMatch(/assessment|quiz|badge/);
    expect(text).not.toMatch(/green frame|#opentowork/);
  });

  it("states the denominator without unverifiable checks", () => {
    expect(summaryText({ state: "improve", passed: 3, verifiable: 5, checking: false })).toBe("3 of 5 verifiable checks passed");
    expect(summaryText({ state: null, passed: 0, verifiable: 0, checking: false })).toBe("Nothing LinkWise can verify automatically");
  });
});
