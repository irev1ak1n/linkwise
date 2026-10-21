// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getOptimizerPage, neighborSections, openOptimizerPage } from "./optimizerNav";
import { SectionCards, SectionPage, reconcileAssessments, sectionDisplay, summaryText, type SectionContext } from "./SectionPages";
import { SECTION_GUIDANCE, DETAIL_SECTIONS, DOCUMENTED_NUMBERS } from "./sectionGuidance";
import { SECTION_GROUPS } from "./sections";
import { computeOptimizerScore } from "./score";
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
      expect(html).toContain('aria-label="Profile Optimizer overview"');
      expect(html).not.toMatch(/Back to Profile Optimizer|‹ Prev|Next ›/);
      // The arrows stay in place at either end, disabled.
      expect(html.match(/class="lw-nav-button"/g)).toHaveLength(3);
      expect(html.includes('aria-label="No previous section" disabled=""')).toBe(index === 0);
      expect(html.includes('aria-label="No next section" disabled=""')).toBe(index === DETAIL_SECTIONS.length - 1);
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
    expect(html).toContain('aria-label="Face is clear and easy to see: Needs your review"');
    expect(html).toContain('aria-label="Change answer for Good lighting"');
    expect(html).toContain('aria-label="Change answer for Profile photo added"');
    expect(html).toContain("1 of 1 verifiable checks passed · 6 need your review");
    expect(html).toContain("Needs your review");
    expect(html.match(/Some checks need your review/g)).toHaveLength(1);
    expect(html).not.toMatch(/Looking Good|doesn&#x27;t analyze|Can&#x27;t verify/);
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
    expect(otw).toContain("Check that your recruiter-only preferences are set the way you want.");
    expect(otw).not.toMatch(/Can&#x27;t verify|doesn&#x27;t read/);
    expect(otw).toContain('aria-label="Open to Work status: Not applicable"');
    expect(renderToStaticMarkup(<SectionPage section="url" context={context()} />)).toContain("linkedin.com/in/jordan-rivera");
  });
});

describe("overview rows", () => {
  const rowOf = (html: string, title: string) => {
    const start = html.lastIndexOf("<button", html.indexOf(`>${title}<`));
    return html.slice(start, html.indexOf("</button>", start));
  };

  it("keep the compact design: icon, title, status circle, chevron, and nothing else", () => {
    const html = renderToStaticMarkup(<SectionCards context={context({ overall: [overall("featured", "add", "high")] })} />);
    const row = rowOf(html, "Featured");
    expect(row).toMatch(/<span class="lw-opt-card__tile" aria-hidden="true"><svg class="lw-opt-card__icon"[\s\S]*<span class="lw-opt-card__title">Featured<\/span><span class="lw-opt-status is-add" aria-hidden="true">–<\/span><svg class="lw-opt-card__chevron"/);
    expect(html).not.toMatch(/High impact<\/span>|lw-opt-card__meta|lw-opt-badge/);
  });

  it("map each status to its circle", () => {
    const ctx = context({ profile: { ...EMPTY_PROFILE, headline: "Passionate, motivated student", extracted: true }, overall: [overall("featured", "add", "high"), overall("headline", "strong", "low")] });
    const html = renderToStaticMarkup(<SectionCards context={ctx} />);
    expect(rowOf(html, "LinkedIn URL")).toContain('lw-opt-status is-strong" aria-hidden="true">✓<');
    expect(rowOf(html, "Network")).toContain('lw-opt-status is-review" aria-hidden="true"><svg');
    expect(rowOf(html, "Headline")).toContain('lw-opt-status is-improve" aria-hidden="true">!<');
    expect(rowOf(html, "Featured")).toContain('lw-opt-status is-add" aria-hidden="true">–<');
    expect(rowOf(html, "Profile Photo")).toContain('lw-opt-status is-review" aria-hidden="true"><svg');
    expect(rowOf(html, "Profile Photo")).toContain(">6 to review<");
    expect(rowOf(html, "Open to Work")).toContain('lw-opt-status is-review" aria-hidden="true"><svg');
  });

  it("say the status, and impact where there's something to do, without relying on color", () => {
    const html = renderToStaticMarkup(<SectionCards context={context({ overall: [overall("featured", "add", "high")] })} />);
    expect(rowOf(html, "Featured")).toContain('aria-label="Featured. Missing section · High impact." title="Missing section · High impact"');
    expect(rowOf(html, "LinkedIn URL")).toContain('aria-label="LinkedIn URL. Strong."');
    expect(rowOf(html, "Network")).toContain('aria-label="Network. Needs your review · 1 check left."');
    expect(rowOf(html, "Open to Work")).toContain('aria-label="Open to Work. Needs your review · 2 checks left."');
    expect(rowOf(html, "Profile Photo")).toContain('aria-label="Profile Photo. Needs your review · 6 checks left."');
  });

  it("D: a photo is never Strong just for existing, and never Bad for unanswered checks", () => {
    const all = (value: boolean) => Object.fromEntries(["photo-face", "photo-lighting", "photo-background", "photo-solo", "photo-professional", "photo-crop"].map((id) => [id, value]));
    expect(sectionDisplay("photo", context())).toEqual({ status: "review", impact: null, toReview: 6 });
    expect(sectionDisplay("photo", context({ answers: { "photo-face": true } }))).toEqual({ status: "review", impact: null, toReview: 5 });
    expect(sectionDisplay("photo", context({ answers: all(true) })).status).toBe("strong");
    expect(sectionDisplay("photo", context({ answers: { ...all(true), "photo-crop": false } })).status).toBe("improve");
    // Withdrawing the answers puts it back to review.
    expect(sectionDisplay("photo", context({ answers: {} })).status).toBe("review");
  });

  it("scores from the answers: unanswered and confirmed equal, a failure lowers it", () => {
    const presence = [{ section: "photo" as const, present: true, itemCount: null, evidenceIds: [] }, { section: "headline" as const, present: true, itemCount: null, evidenceIds: [] }];
    const overallPhoto = { ...overall("headline", "strong", "low"), section: "photo" as const };
    const score = (answers: Record<string, boolean>) => computeOptimizerScore(presence, reconcileAssessments(context({ overall: [overallPhoto], answers })));
    expect(score({})).toBe(score({ "photo-face": true }));
    expect(score({ "photo-face": false })).toBeLessThan(score({}));
  });

  it("shows Open to Work as Needs your review until answered, never Strong or Improve", () => {
    expect(sectionDisplay("openToWork", context())).toEqual({ status: "review", impact: null, toReview: 2 });
    expect(sectionDisplay("openToWork", context({ shell: shell(true, false, { openToWork: null }) })).status).toBe("review");
    expect(renderToStaticMarkup(<SectionPage section="openToWork" context={context()} />)).toContain("lw-opt-badge is-review");
    // Answering both questions settles it.
    expect(sectionDisplay("openToWork", context({ answers: { "otw-roles": true, "otw-recruiters": true } })).status).not.toBe("review");
  });

  it("are whole-row buttons, so long titles sit beside the circle in one row", () => {
    const html = renderToStaticMarkup(<SectionCards context={context()} />);
    expect(html.match(/<button type="button" class="lw-opt-card"/g)).toHaveLength(18);
    for (const title of ["Licenses &amp; Certifications", "Volunteer Experience", "Honors &amp; Awards"]) expect(rowOf(html, title)).toContain(`<span class="lw-opt-card__title">${title}</span>`);
  });
});

describe("partly read lists", () => {
  it("asks the user to check the AI-judged items against the full list instead of failing them", () => {
    const profile = { ...EMPTY_PROFILE, skills: ["Customer Service", "Tutoring"], extracted: true };
    const body = {
      profile: { identity: "me", evidence: [{ id: "skills:0", section: "skills" as const, text: "Customer Service, Tutoring", evidenceType: "skills" }] },
      sections: [{ section: "skills" as const, present: true, itemCount: 50, evidenceIds: ["skills:0"] }],
      userContext: "",
    };
    const html = renderToStaticMarkup(<SectionPage section="skills" context={context({ profile, body })} />);
    expect(html).toContain("LinkWise read 2 of your 50 entries here. Check this against your full list.");
    expect(html).not.toMatch(/can&#x27;t judge|can&#x27;t verify/i);
    expect(html).not.toContain("Needs improvement");
  });
});

describe("overview and detail agree", () => {
  it("takes the overview's state from the detail checklist", () => {
    const ctx = context({ profile: { ...EMPTY_PROFILE, headline: "Passionate, motivated student", extracted: true }, overall: [overall("headline", "strong", "low")] });
    expect(sectionDisplay("headline", ctx)).toEqual({ status: "improve", impact: "Medium impact" });
    expect(reconcileAssessments(ctx)[0]).toMatchObject({ section: "headline", state: "improve" });
    const detail = renderToStaticMarkup(<SectionPage section="headline" context={ctx} />);
    expect(detail).toContain("Needs Improvement");
    expect(detail).toContain("Medium impact");
    expect(renderToStaticMarkup(<SectionCards context={ctx} />)).toContain('aria-label="Headline. Needs improvement · Medium impact."');
  });

  it("keeps the review's state while the detail checks are still pending", () => {
    const ctx = context({ profile: { ...EMPTY_PROFILE, headline: "Aspiring Software Engineer building web apps", extracted: true }, overall: [overall("headline", "strong", "low")] });
    expect(sectionDisplay("headline", ctx).status).toBe("strong");
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

  it("states the denominator, and what is left for the user", () => {
    expect(summaryText({ state: "improve", passed: 3, verifiable: 5, checking: false, needsUser: 0 })).toBe("3 of 5 verifiable checks passed");
    expect(summaryText({ state: null, passed: 0, verifiable: 0, checking: false, needsUser: 0 })).toBe("Nothing to review");
    expect(summaryText({ state: "strong", passed: 1, verifiable: 1, checking: false, needsUser: 1 })).toBe("1 of 1 verifiable checks passed · 1 needs your review");
  });
});

describe("answer menu", () => {
  it("opens a small menu on any row, and every choice is a local update", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { ChecklistRows } = await import("./SectionPages");
    const calls: [string, boolean | null][] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const criteria = [
      { id: "location-present", label: "Location added", verification: "deterministic" as const, status: "pass" as const, explanation: "Charlotte", evidenceIds: [], userValue: null, automatic: { status: "pass" as const, explanation: "Charlotte" } },
      { id: "location-target", label: "Fits where you want opportunities", verification: "user" as const, status: "needs_user" as const, explanation: "Check that this location matches where you want to work.", evidenceIds: [], userValue: null },
    ];
    act(() => root.render(<ChecklistRows criteria={criteria} onAnswer={(id, value) => calls.push([id, value])} />));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Change answer for Location added"]')!.click());
    expect(container.textContent).toContain("Looks good");
    expect(container.textContent).not.toContain("Use LinkWise result");
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Mark Location added as needs improvement"]')!.click());
    expect(calls).toEqual([["location-present", false]]);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    // With an override in place, the menu offers the way back to LinkWise's own result.
    const overridden = [{ ...criteria[0]!, status: "improve" as const, userValue: false }, criteria[1]!];
    act(() => root.render(<ChecklistRows criteria={overridden} onAnswer={(id, value) => calls.push([id, value])} />));
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Change answer for Location added"]')!.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Use LinkWise result for Location added"]')!.click());
    expect(calls.at(-1)).toEqual(["location-present", null]);
    act(() => root.unmount());
    container.remove();
  });
});
