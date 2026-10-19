// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { SignalAnalysisController, clearSignalCache, type SignalAnalysisState } from "../ai/signalAnalysisController";
import type { AnalyzeSignalsRequestBody } from "../ai/signalsClient";
import type { GradedCandidateDTO, SignalClassificationOutcome } from "../ai/signalTypes";
import { SignalHighlighter, highlightName, type HighlightRegistryLike } from "./signalHighlighter";
import { DEFAULT_HIGHLIGHT_PREFERENCES, type HighlightPreferences } from "../signals/highlightCategories";
const QUOTE_HIGHLIGHT = highlightName("leadership");
import { createSignalRuntime, isMainProfilePage, isProfileSessionPage, signalTargets, signalTickInput, structuralTargets } from "./signalRuntime";
import { skillGroups } from "../signals/skillLists";

const entries = new Map<string, { ranges: Range[] }>();
const registry: HighlightRegistryLike = { set: (n, h) => entries.set(n, h as unknown as { ranges: Range[] }), delete: (n) => entries.delete(n) };
const factory = (ranges: Range[]) => ({ ranges }) as unknown as Highlight;

function profile(description: string): LinkedInProfile {
  return { ...EMPTY_PROFILE, name: "Jordan", headline: "Engineer", experience: [{ title: "Web Lead", description }], extracted: true };
}

function leadership(evidenceId: string, quote: string, fact: string | null = quote): GradedCandidateDTO {
  return {
    evidenceId,
    section: "experience",
    quote,
    fact,
    type: "leadership_scope",
    grades: { impact: 2, ownership: 3, result: 1, scale: 2, selectivity: 0, leadership: 3, technicalDepth: 1, sustainedDepth: 1, specificity: 2, distinctiveness: 2, genericness: 0 },
    goalRelevance: 0,
    confidence: 0.9,
    metrics: [],
  };
}

function outcomeFor(body: AnalyzeSignalsRequestBody): SignalClassificationOutcome {
  const item = body.profile.evidence.find((e) => e.section === "experience")!;
  const quote = item.text.split(" — ")[1]!;
  return { status: "ok", careerStage: "professional", candidates: [leadership(item.id, quote)], classified: body.profile.evidence.map((e) => e.id) };
}

function setPage(description: string): void {
  document.body.innerHTML = `<main role="main"><section><h1>Jordan</h1></section><section><h2>Experience</h2><p>Web Lead</p><p>${description}</p></section></main>`;
}

let prefs: HighlightPreferences = DEFAULT_HIGHLIGHT_PREFERENCES;

function harness(outcome: (body: AnalyzeSignalsRequestBody) => SignalClassificationOutcome = outcomeFor) {
  const published: SignalAnalysisState[] = [];
  const request = vi.fn((body: AnalyzeSignalsRequestBody) => ({ requestId: "r", promise: Promise.resolve(outcome(body)), cancel: vi.fn() }));
  const runtime = createSignalRuntime({
    highlighter: new SignalHighlighter(document, registry, factory),
    publish: (state) => published.push(state),
    createController: (onChange) => new SignalAnalysisController({ onChange, request, debounceMs: 10 }),
    getPreferences: () => prefs,
  });
  return { runtime, request, published };
}

const JORDAN = "https://www.linkedin.com/in/jordan/";

beforeEach(() => {
  vi.useFakeTimers();
  entries.clear();
  clearSignalCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isMainProfilePage", () => {
  it("accepts a main profile page only", () => {
    expect(isMainProfilePage("https://www.linkedin.com/in/jordan/")).toBe(true);
    expect(isMainProfilePage("https://www.linkedin.com/in/jordan?trk=x")).toBe(true);
    expect(isMainProfilePage("https://www.linkedin.com/in/jordan/details/experience/")).toBe(false);
    expect(isMainProfilePage("https://www.linkedin.com/feed/")).toBe(false);
  });
});

describe("isProfileSessionPage", () => {
  it("accepts the main page and its detail pages, nothing else", () => {
    expect(isProfileSessionPage("https://www.linkedin.com/in/jordan/")).toBe(true);
    expect(isProfileSessionPage("https://www.linkedin.com/in/jordan/details/education/")).toBe(true);
    expect(isProfileSessionPage("https://www.linkedin.com/in/jordan/details/education/edit/forms/1/")).toBe(false);
    expect(isProfileSessionPage("https://www.linkedin.com/in/jordan/recent-activity/all/")).toBe(false);
  });
});

const off = (...names: (keyof HighlightPreferences["categories"])[]): HighlightPreferences => ({
  ...DEFAULT_HIGHLIGHT_PREFERENCES,
  categories: Object.fromEntries(Object.entries(DEFAULT_HIGHLIGHT_PREFERENCES.categories).map(([k, v]) => [k, { ...v, enabled: !names.includes(k as never) }])) as HighlightPreferences["categories"],
});

describe("signalTargets", () => {
  const base = { evidenceId: "about:0", section: "about" as const, type: "core" as const, metrics: [], category: "impact" as const };

  it("keeps only highlights above the inline threshold", () => {
    expect(signalTargets([{ ...base, quote: "a", importance: 0.4 }, { ...base, quote: "b", importance: 0.55 }]).map((t) => t.quote)).toEqual(["b"]);
  });

  it("styles each phrase by its kind, and draws a switched-off kind in the general style", () => {
    const highlights = [
      { ...base, quote: "Led a 5-person team", importance: 1, category: "leadership" as const, metrics: ["5-person"] },
      { ...base, quote: "Won 2nd place at States", importance: 1, category: "achievements" as const, metrics: ["2nd place"] },
    ];
    expect(signalTargets(highlights).map((t) => [t.layer, t.metrics])).toEqual([
      ["leadership", ["5-person"]],
      ["achievements", ["2nd place"]],
    ]);
    // Turning a kind off changes its color, never whether the claim shows.
    expect(signalTargets(highlights, off("leadership")).map((t) => [t.quote, t.layer])).toEqual([
      ["Led a 5-person team", "general"],
      ["Won 2nd place at States", "achievements"],
    ]);
    // Numbers off: the phrases stay, their numbers are simply not marked.
    expect(signalTargets(highlights, off("numbers")).map((t) => t.metrics)).toEqual([[], []]);
  });

  it("keeps every claim, in the general style, with every category switched off", () => {
    const highlights = [
      { ...base, quote: "Reached 500+ people through the website", importance: 1, category: "impact" as const, metrics: ["500+ people"] },
      { ...base, quote: "9 years of software training", importance: 0.75, category: "general" as const, metrics: [] },
    ];
    const allOff = off("roles", "numbers", "impact", "leadership", "skills", "achievements", "projects", "languages");
    expect(signalTargets(highlights, allOff).map((t) => [t.quote, t.layer, t.metrics])).toEqual([
      ["Reached 500+ people through the website", "general", []],
      ["9 years of software training", "general", []],
    ]);
  });

  it("marks the person's skills only inside chosen phrases, never over a number", () => {
    const highlights = [{ ...base, quote: "Built 3 apps in React and Python (Django)", importance: 1, metrics: ["3 apps"] }];
    expect(signalTargets(highlights, DEFAULT_HIGHLIGHT_PREFERENCES, ["React.js", "Python (Programming Language)"])[0]!.skills).toEqual(["React and Python", "Django"]);
    expect(signalTargets(highlights, off("skills"), ["React"])[0]!.skills).toEqual([]);
  });
});

describe("structuralTargets", () => {
  const person: LinkedInProfile = {
    ...EMPTY_PROFILE,
    experience: [{ title: "Founder & CEO", company: "Donish AI" }],
    volunteering: [{ name: "Tutor", description: "Math Center" }],
    projects: [{ name: "LinkWise" }],
    languages: [{ name: "Russian", description: "Native or bilingual proficiency" }],
    skills: ["Python"],
  };

  it("reads roles from position titles, never organizations, plus project names and spoken languages", () => {
    const targets = structuralTargets(person);
    expect(targets.map((t) => [t.layer, t.quote, t.titles])).toEqual([
      ["roles", "Founder & CEO", "only"],
      ["roles", "Tutor", "only"],
      ["projects", "LinkWise", "only"],
      ["languages", "Russian", "any"],
      ["languages", "Native or bilingual proficiency", "any"],
    ]);
    expect(targets.map((t) => t.quote)).not.toContain("Donish AI");
    // Programming languages are skills, never spoken languages.
    expect(targets.some((t) => t.layer === "languages" && t.quote === "Python")).toBe(false);
  });

  it("leaves out switched-off kinds", () => {
    expect(structuralTargets(person, off("roles", "languages")).map((t) => t.layer)).toEqual(["projects"]);
  });
});

describe("signalTickInput", () => {
  const collection = { status: "settled" } as never;

  it("uses panel data that belongs to the current URL", () => {
    const input = signalTickInput(true, JORDAN, { profileKey: "jordan", profile: profile("x"), collection });
    expect(input).toMatchObject({ profileKey: "jordan", ready: true });
    expect(input.profile).not.toBeNull();
  });

  it("ignores the previous profile's data right after SPA navigation", () => {
    const input = signalTickInput(true, "https://www.linkedin.com/in/sam/", { profileKey: "jordan", profile: profile("x"), collection });
    expect(input).toEqual({ goalText: null, enabled: true, highlight: true, href: "https://www.linkedin.com/in/sam/", profileKey: "sam", profile: null, ready: false });
  });

  it("is not ready while an auto scan is still crawling", () => {
    const scanning = { sessionId: "s", status: "scanning" as const, currentIndex: 0, sections: [] };
    expect(signalTickInput(true, JORDAN, { profileKey: "jordan", profile: profile("x"), collection, autoScanProgress: scanning }).ready).toBe(false);
  });
});

describe("createSignalRuntime", () => {
  it("highlights once collection is ready, and not before", async () => {
    setPage("Led a 4-person web team");
    const { runtime, request, published } = harness();
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: false });
    await vi.advanceTimersByTimeAsync(50);
    expect(request).not.toHaveBeenCalled();
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team"]);
    expect(published.at(-1)).toMatchObject({ status: "ready", profileKey: "jordan" });
  });

  it("removes highlights when turned off, and reuses the cache when turned back on", async () => {
    setPage("Led a 4-person web team");
    const { runtime, request } = harness();
    const input = { enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true };
    runtime.tick(input);
    await vi.advanceTimersByTimeAsync(50);
    runtime.tick({ ...input, enabled: false });
    expect(entries.size).toBe(0);
    runtime.tick(input);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges).toHaveLength(1);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("analyzes for Key Evidence without highlighting the page while Signal Mode is off", async () => {
    setPage("Led a 4-person web team");
    const { runtime, request, published } = harness();
    const input = { enabled: true, highlight: false, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true };
    runtime.tick(input);
    await vi.advanceTimersByTimeAsync(50);
    expect(published.at(-1)).toMatchObject({ status: "ready", facts: [{ text: "Led a 4-person web team" }] });
    expect(entries.size).toBe(0);
    runtime.tick({ ...input, highlight: true });
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges).toHaveLength(1);
    runtime.tick(input);
    expect(entries.size).toBe(0);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("resets signals when navigating to another profile", async () => {
    setPage("Led a 4-person web team");
    const { runtime, published } = harness();
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    setPage("Built a robot arm");
    runtime.tick({ enabled: true, href: "https://www.linkedin.com/in/sam/", profileKey: "sam", profile: null, ready: false });
    expect(entries.size).toBe(0);
    expect(published.at(-1)).toEqual({ status: "idle" });
    runtime.tick({ enabled: true, href: "https://www.linkedin.com/in/sam/", profileKey: "sam", profile: profile("Built a robot arm"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(published.at(-1)).toMatchObject({ status: "ready", profileKey: "sam" });
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Built a robot arm"]);
  });

  it("stays off on non-profile pages", () => {
    setPage("Led a 4-person web team");
    const { runtime, request, published } = harness();
    runtime.tick({ enabled: true, href: "https://www.linkedin.com/in/jordan/recent-activity/all/", profileKey: "jordan", profile: profile("x"), ready: true });
    expect(request).not.toHaveBeenCalled();
    expect(published.at(-1)).toEqual({ status: "idle" });
  });

  it("keeps the same person's signals when moving from the main page to a detail page", async () => {
    setPage("Led a 4-person web team");
    const { runtime, request, published } = harness();
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    runtime.tick({ enabled: true, href: "https://www.linkedin.com/in/jordan/details/education/", profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(published.at(-1)).toMatchObject({ status: "ready", profileKey: "jordan" });
    expect(published.some((s) => s.status === "idle" && published.indexOf(s) > 1)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("falls back to local heuristic highlights when AI is unavailable", async () => {
    setPage("Led a 4-person web team");
    const { runtime, published } = harness(() => ({ status: "unavailable", reason: "not_configured" }));
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(published.at(-1)).toMatchObject({ status: "ready", source: "heuristic", updateError: "not_configured" });
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team"]);
  });

  it("draws an entry title only as a Role, never as graded evidence", async () => {
    document.body.innerHTML = `<main role="main"><section><h1>Jordan</h1></section><section><h2>Experience</h2><p style="font-weight: 600">Web Lead</p><p>Led a 4-person web team</p></section></main>`;
    const { runtime, published } = harness((body) => {
      const item = body.profile.evidence.find((e) => e.section === "experience")!;
      return {
        status: "ok",
        careerStage: "professional",
        candidates: [leadership(item.id, "Web Lead", "Web Lead role"), leadership(item.id, "Led a 4-person web team")],
        classified: [item.id],
      };
    });
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team"]);
    expect(entries.get(highlightName("roles"))!.ranges.map((r) => r.toString())).toEqual(["Web Lead"]);
    expect(published.at(-1)).toMatchObject({ status: "ready" });
  });

  it("redraws a switched-off kind in the general style and back from the same evidence, with no new request", async () => {
    prefs = DEFAULT_HIGHLIGHT_PREFERENCES;
    setPage("Led a 4-person web team");
    const { runtime, request } = harness();
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges).toHaveLength(1);
    prefs = off("leadership");
    runtime.repaint();
    expect(entries.has(QUOTE_HIGHLIGHT)).toBe(false);
    expect(entries.get(highlightName("general"))!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team"]);
    prefs = DEFAULT_HIGHLIGHT_PREFERENCES;
    runtime.repaint();
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team"]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("clears highlights on dispose", async () => {
    setPage("Led a 4-person web team");
    const { runtime } = harness();
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    runtime.dispose();
    expect(entries.size).toBe(0);
  });
});

describe("signalTargets - Skills & Tools list coverage", () => {
  const text = "Northfield Academy — Over 6 years, I acquired skills in Python, C++, C#, .NET, WPF, SQL, Laravel, web development, robotics, and game design.";
  const coverage = { groups: skillGroups([{ id: "education:0", section: "education", text }]), itemTexts: new Map([["education:0", text]]) };
  const claim = { evidenceId: "education:0", section: "education" as const, quote: "Over 6 years, I acquired skills in Python, C++, C#", type: "core" as const, importance: 1, metrics: ["6 years"], category: "general" as const, sentence: "education:1" };

  it("shows the whole announced list: inside the chosen claim as marks, the rest on its own", () => {
    const targets = signalTargets([claim], DEFAULT_HIGHLIGHT_PREFERENCES, [], coverage);
    expect(targets[0]!.skills).toEqual(["Python, C++, C#"]);
    expect(targets.slice(1).map((t) => [t.quote, t.layer, t.counted])).toEqual([
      [".NET, WPF, SQL, Laravel", "skills", false],
      ["web development, robotics, and game design", "skills", false],
    ]);
  });

  it("never draws two ranges over the same text", () => {
    const targets = signalTargets([claim], DEFAULT_HIGHLIGHT_PREFERENCES, [], coverage);
    const spans = targets.map((t) => [text.indexOf(t.quote), text.indexOf(t.quote) + t.quote.length] as const).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1]);
  });

  it("leaves list coverage out entirely while Skills & Tools is off, and brings back the same on", () => {
    expect(signalTargets([claim], off("skills"), [], coverage).map((t) => t.quote)).toEqual([claim.quote]);
    expect(signalTargets([claim], DEFAULT_HIGHLIGHT_PREFERENCES, [], coverage)).toEqual(signalTargets([claim], DEFAULT_HIGHLIGHT_PREFERENCES, [], coverage));
  });

  it("marks a number and the skills of one claim side by side, never nested", () => {
    const tutoring = "Tutor — Completed 150+ hours of tutoring in Python and C++, supporting 15+ students.";
    const cov = { groups: skillGroups([{ id: "experience:0", section: "experience", text: tutoring }]), itemTexts: new Map([["experience:0", tutoring]]) };
    const h = { evidenceId: "experience:0", section: "experience" as const, quote: "Completed 150+ hours of tutoring in Python and C++", type: "core" as const, importance: 1, metrics: ["150+ hours"], category: "leadership" as const };
    const [target] = signalTargets([h], DEFAULT_HIGHLIGHT_PREFERENCES, [], cov);
    expect(target!.metrics).toEqual(["150+ hours"]);
    expect(target!.skills).toEqual(["Python and C++"]);
  });
});
