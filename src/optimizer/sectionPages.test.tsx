import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getOptimizerPage, neighborSections, openOptimizerPage } from "./optimizerNav";
import { SectionCards, SectionPage, sectionStatus, summaryText, type SectionContext } from "./SectionPages";
import { SECTION_GUIDANCE, DETAIL_SECTIONS } from "./sectionGuidance";
import { OPTIMIZER_SECTIONS } from "./sections";
import { EMPTY_PROFILE } from "../models/profile";

const shell = (hasPhoto: boolean, hasBanner: boolean) => ({ isOwnProfile: true, hasPhoto, hasBanner, sections: {} });
const context = (overrides: Partial<SectionContext> = {}): SectionContext => ({
  shell: shell(true, false),
  profile: { ...EMPTY_PROFILE, headline: "Student developer", extracted: true },
  body: null,
  overall: [],
  ...overrides,
});

afterEach(() => openOptimizerPage({ name: "home" }));

describe("optimizer navigation", () => {
  it("opens a section page and returns home", () => {
    openOptimizerPage({ name: "section", section: "banner" });
    expect(getOptimizerPage()).toEqual({ name: "section", section: "banner" });
    openOptimizerPage({ name: "home" });
    expect(getOptimizerPage()).toEqual({ name: "home" });
  });

  it("gives every section a detail page, in order", () => {
    expect(DETAIL_SECTIONS).toEqual(OPTIMIZER_SECTIONS.map((s) => s.section));
    expect(neighborSections("photo")).toEqual({ prev: null, next: "banner" });
    expect(neighborSections("headline")).toEqual({ prev: "banner", next: "about" });
    expect(neighborSections("location")).toEqual({ prev: "languages", next: null });
  });
});

describe("section status", () => {
  it("comes from the checklist: a photo is strong, the default banner and an absent headline are missing", () => {
    expect(sectionStatus("photo", context())).toBe("strong");
    expect(sectionStatus("photo", context({ shell: shell(false, false) }))).toBe("missing");
    expect(sectionStatus("banner", context())).toBe("missing");
    expect(sectionStatus("banner", context({ shell: shell(true, true) }))).toBe("strong");
    expect(sectionStatus("headline", context({ profile: { ...EMPTY_PROFILE } }))).toBe("missing");
  });

  it("reports a failed local check right away, and uses the overall review while AI checks are pending", () => {
    expect(sectionStatus("headline", context({ profile: { ...EMPTY_PROFILE, headline: "Hi", extracted: true } }))).toBe("improve");
    const overall = [{ section: "headline" as const, state: "strong" as const, impact: "low" as const, reason: "", sourceType: "linkedin_profile" as const, evidenceIds: [], suggestions: [] }];
    expect(sectionStatus("headline", context({ profile: { ...EMPTY_PROFILE, headline: "Aspiring Software Engineer building web apps", extracted: true }, overall }))).toBe("strong");
  });
});

describe("section rendering", () => {
  it("lists every section with an AI pill only where AI checks run", () => {
    const html = renderToStaticMarkup(<SectionCards context={context()} />);
    expect(html.match(/class="lw-opt-card"/g)).toHaveLength(OPTIMIZER_SECTIONS.length);
    expect(html.match(/✨ AI/g)).toHaveLength(7);
  });

  it("renders evaluated rows, not empty checkboxes, and counts only verifiable criteria", () => {
    const html = renderToStaticMarkup(<SectionPage section="photo" context={context()} />);
    expect(html).toContain("← Back to Profile Optimizer");
    expect(html).toContain('aria-label="Profile photo added: Meets criterion"');
    expect(html).toContain('aria-label="Face is easy to see: Can&#x27;t verify automatically"');
    expect(html).toContain("1 of 1 verifiable criteria met");
    expect(html).toContain("Looking Good");
    expect(html).not.toContain("☐");
    expect(html).toContain("Go to profile photo");
  });

  it("shows a missing section as one recommendation, not a wall of failures", () => {
    const html = renderToStaticMarkup(<SectionPage section="projects" context={context()} />);
    expect(html).toContain("Missing");
    expect(html).toContain("Optional");
    expect(html).toContain(SECTION_GUIDANCE.projects.missing);
    expect(html).toContain("What a strong Projects section includes");
    expect(html).not.toContain("Needs improvement");
    expect(html).not.toContain("lw-opt-check ");
  });

  it("marks a core section's absence as high impact", () => {
    expect(renderToStaticMarkup(<SectionPage section="experience" context={context()} />)).toContain("High impact");
  });

  it("shows the current headline with its checks and offers the generator", () => {
    const html = renderToStaticMarkup(<SectionPage section="headline" context={context()} />);
    expect(html).toContain('<blockquote class="lw-opt-quote">Student developer</blockquote>');
    expect(html).toContain('aria-label="Focused length: Needs improvement"');
    expect(html).toContain('aria-label="States your role or direction: Checking"');
    expect(html).toContain("✨ Generate using AI");
  });

  it("keeps guidance free of unsourced statistics", () => {
    const text = JSON.stringify(SECTION_GUIDANCE);
    expect(text).not.toMatch(/\d+x more|36x|21x/i);
    for (const guidance of Object.values(SECTION_GUIDANCE)) expect(guidance.sources.length).toBeGreaterThan(0);
  });
});

describe("summaryText", () => {
  it("never puts unverifiable criteria in the denominator", () => {
    expect(summaryText({ state: "improve", passed: 3, verifiable: 5, checking: false })).toBe("3 of 5 verifiable criteria met");
    expect(summaryText({ state: null, passed: 0, verifiable: 0, checking: false })).toBe("Nothing LinkWise can verify automatically");
  });
});
