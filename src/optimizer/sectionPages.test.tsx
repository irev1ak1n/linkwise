import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getOptimizerPage, neighborSections, openOptimizerPage } from "./optimizerNav";
import { SectionCards, SectionPage, sectionStatus, type SectionContext } from "./SectionPages";
import { SECTION_GUIDANCE, DETAIL_SECTIONS } from "./sectionGuidance";
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

  it("moves between detail sections in order", () => {
    expect(DETAIL_SECTIONS).toEqual(["photo", "banner", "headline"]);
    expect(neighborSections("photo")).toEqual({ prev: null, next: "banner" });
    expect(neighborSections("banner")).toEqual({ prev: "photo", next: "headline" });
    expect(neighborSections("headline")).toEqual({ prev: "banner", next: null });
  });
});

describe("section status", () => {
  it("takes photo and banner status from the page", () => {
    expect(sectionStatus("photo", context())).toBe("strong");
    expect(sectionStatus("photo", context({ shell: shell(false, false) }))).toBe("missing");
    expect(sectionStatus("banner", context())).toBe("improve");
    expect(sectionStatus("banner", context({ shell: shell(true, true) }))).toBe("strong");
  });

  it("uses the headline analysis first, then the overall review, and Missing without a headline", () => {
    const overall = [{ section: "headline" as const, state: "improve" as const, impact: "medium" as const, reason: "", sourceType: "linkedin_profile" as const, evidenceIds: [], suggestions: [] }];
    expect(sectionStatus("headline", context({ overall }))).toBe("improve");
    expect(sectionStatus("headline", context({ overall }), { state: "strong", summary: "", findings: [], ideas: [] })).toBe("strong");
    expect(sectionStatus("headline", context({ profile: { ...EMPTY_PROFILE } }))).toBe("missing");
  });
});

describe("section rendering", () => {
  it("renders navigation rows with status marks and an AI pill only where AI helps", () => {
    const html = renderToStaticMarkup(<SectionCards context={context()} />);
    expect(html.match(/class="lw-opt-card"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Looking Good"');
    expect(html).toContain('aria-label="Needs Improvement"');
    expect(html.match(/✨ AI/g)).toHaveLength(1);
  });

  it("renders the shared detail structure with Back and Prev / Next", () => {
    const html = renderToStaticMarkup(<SectionPage section="photo" context={context()} />);
    expect(html).toContain("← Back to Profile Optimizer");
    expect(html).toMatch(/<button type="button" disabled="">‹ Prev<\/button>/);
    expect(html).toContain("Next ›");
    expect(html).toContain(SECTION_GUIDANCE.photo!.description);
    for (const item of SECTION_GUIDANCE.photo!.checklist) expect(html).toContain(item.replace(/'/g, "&#x27;"));
    expect(html).toContain("Looking Good");
    expect(html).toContain("Go to profile photo");
    expect(html).not.toContain("Generate using AI");
  });

  it("states the default banner without describing the image", () => {
    const html = renderToStaticMarkup(<SectionPage section="banner" context={context()} />);
    expect(html).toContain("appears to use LinkedIn&#x27;s default background");
    expect(html).toContain("Needs Improvement");
  });

  it("shows the current headline separately from static tips and offers the generator", () => {
    const html = renderToStaticMarkup(<SectionPage section="headline" context={context()} />);
    expect(html).toContain('<blockquote class="lw-opt-quote">Student developer</blockquote>');
    expect(html).toContain("Best practices");
    expect(html).toContain("✨ Generate using AI");
  });

  it("keeps guidance free of unsourced statistics", () => {
    const text = JSON.stringify(SECTION_GUIDANCE);
    expect(text).not.toMatch(/\d+x more|36x|21x/i);
    for (const guidance of Object.values(SECTION_GUIDANCE)) expect(guidance!.sources.length).toBeGreaterThan(0);
  });
});
