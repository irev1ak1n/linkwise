// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { SignalAnalysisController, type SignalAnalysisState } from "../ai/signalAnalysisController";
import type { AnalyzeSignalsRequestBody } from "../ai/signalsClient";
import type { SignalAnalysisOutcome } from "../ai/signalTypes";
import { QUOTE_HIGHLIGHT, SignalHighlighter, type HighlightRegistryLike } from "./signalHighlighter";
import { createSignalRuntime, isMainProfilePage, signalTargets, signalTickInput } from "./signalRuntime";

const entries = new Map<string, { ranges: Range[] }>();
const registry: HighlightRegistryLike = { set: (n, h) => entries.set(n, h as unknown as { ranges: Range[] }), delete: (n) => entries.delete(n) };
const factory = (ranges: Range[]) => ({ ranges }) as unknown as Highlight;

function profile(description: string): LinkedInProfile {
  return { ...EMPTY_PROFILE, name: "Jordan", headline: "Engineer", experience: [{ title: "Web Lead", description }], extracted: true };
}

function outcomeFor(body: AnalyzeSignalsRequestBody): SignalAnalysisOutcome {
  const item = body.profile.evidence.find((e) => e.section === "experience")!;
  const quote = item.text.split(" — ")[1]!;
  return {
    status: "ok",
    signals: [{ evidenceId: item.id, section: "experience", quote, type: "leadership", strength: "strong", importance: 0.9, metrics: [] }],
    facts: [{ text: quote, evidenceId: item.id }],
  };
}

function setPage(description: string): void {
  document.body.innerHTML = `<main role="main"><section><h1>Jordan</h1></section><section><h2>Experience</h2><p>Web Lead</p><p>${description}</p></section></main>`;
}

function harness(outcome: (body: AnalyzeSignalsRequestBody) => SignalAnalysisOutcome = outcomeFor) {
  const published: SignalAnalysisState[] = [];
  const request = vi.fn((body: AnalyzeSignalsRequestBody) => ({ requestId: "r", promise: Promise.resolve(outcome(body)), cancel: vi.fn() }));
  const runtime = createSignalRuntime({
    highlighter: new SignalHighlighter(document, registry, factory),
    publish: (state) => published.push(state),
    createController: (onChange) => new SignalAnalysisController({ onChange, request, debounceMs: 10 }),
  });
  return { runtime, request, published };
}

const JORDAN = "https://www.linkedin.com/in/jordan/";

beforeEach(() => {
  vi.useFakeTimers();
  entries.clear();
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

describe("signalTargets", () => {
  it("keeps only signals above the inline threshold", () => {
    const base = { evidenceId: "about:0", section: "about" as const, type: "role" as const, strength: "moderate" as const, metrics: [] };
    expect(signalTargets([{ ...base, quote: "a", importance: 0.55 }, { ...base, quote: "b", importance: 0.8 }]).map((t) => t.quote)).toEqual(["b"]);
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
    expect(input).toEqual({ enabled: true, href: "https://www.linkedin.com/in/sam/", profileKey: "sam", profile: null, ready: false });
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
    runtime.tick({ enabled: true, href: "https://www.linkedin.com/in/jordan/details/experience/", profileKey: "jordan", profile: profile("x"), ready: true });
    expect(request).not.toHaveBeenCalled();
    expect(published.at(-1)).toEqual({ status: "idle" });
  });

  it("publishes unavailable and highlights nothing when AI is unavailable", async () => {
    setPage("Led a 4-person web team");
    const { runtime, published } = harness(() => ({ status: "unavailable", reason: "not_configured" }));
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(published.at(-1)).toEqual({ status: "unavailable", reason: "not_configured" });
    expect(entries.size).toBe(0);
  });

  it("keeps a title's role fact in the facts list without highlighting the title", async () => {
    document.body.innerHTML = `<main role="main"><section><h1>Jordan</h1></section><section><h2>Experience</h2><p style="font-weight: 600">Web Lead</p><p>Led a 4-person web team</p></section></main>`;
    const { runtime, published } = harness((body) => {
      const item = body.profile.evidence.find((e) => e.section === "experience")!;
      return {
        status: "ok",
        signals: [
          { evidenceId: item.id, section: "experience", quote: "Web Lead", type: "role", strength: "strong", importance: 0.8, metrics: [] },
          { evidenceId: item.id, section: "experience", quote: "Led a 4-person web team", type: "leadership", strength: "strong", importance: 0.9, metrics: [] },
        ],
        facts: [{ text: "Web Lead role", evidenceId: item.id }],
      };
    });
    runtime.tick({ enabled: true, href: JORDAN, profileKey: "jordan", profile: profile("Led a 4-person web team"), ready: true });
    await vi.advanceTimersByTimeAsync(50);
    expect(entries.get(QUOTE_HIGHLIGHT)!.ranges.map((r) => r.toString())).toEqual(["Led a 4-person web team"]);
    expect(published.at(-1)).toMatchObject({ status: "ready", facts: [{ text: "Web Lead role" }] });
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
