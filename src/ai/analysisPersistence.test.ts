// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCriterion, createGoal } from "../models/goal";
import { EMPTY_PROFILE } from "../models/profile";
import { scoreProfileAgainstGoal } from "../matching/scoreProfile";
import type { AiAnalysisOutcome } from "./apiTypes";

let data: Record<string, unknown>;

beforeEach(() => {
  vi.resetModules();
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in data ? { [key]: structuredClone(data[key]) } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          return Promise.resolve();
        },
      },
    },
  };
});

const goal = { ...createGoal("Mentors"), criteria: [createCriterion("Python", "MUST_HAVE")] };
const profile = { ...EMPTY_PROFILE, name: "Jordan", skills: ["Python"], extracted: true };
const outcome: Extract<AiAnalysisOutcome, { status: "ok" }> = {
  status: "ok",
  model: "m",
  result: { scorePercent: 78, disqualified: false, reasons: [], missing: [], complete: true, profileExtracted: true, confidence: 1 },
  narrative: { strengths: [], gaps: [], experienceAssessment: "relevant", experienceAssessmentReason: "", recommendationReason: "", contactRecommendationReason: "", saveRecommendationReason: "", confidenceLevel: "medium" },
};

describe("match analysis across a full reload", () => {
  it("restores the cached result without a new request or a blank state", async () => {
    const first = await import("./aiAnalysisController");
    const request = vi.fn(() => ({ requestId: "r", promise: Promise.resolve(outcome), cancel: vi.fn() }));
    const before = new first.AiAnalysisController({ requestAiAnalysis: request, debounceMs: 0 });
    const states: string[] = [];
    before.request(goal, profile, scoreProfileAgainstGoal(goal, profile), (s) => states.push(s.status));
    await vi.waitFor(() => expect(states.at(-1)).toBe("ready"));

    vi.resetModules();
    const cache = await import("./aiAnalysisCache");
    const second = await import("./aiAnalysisController");
    const hydrating = cache.hydrateAnalysisCache();
    const afterRequest = vi.fn();
    const after = new second.AiAnalysisController({ requestAiAnalysis: afterRequest, debounceMs: 0 });
    const afterStates: { status: string; outcome?: { result: { scorePercent: number | null } } }[] = [];
    after.request(goal, profile, scoreProfileAgainstGoal(goal, profile), (s) => afterStates.push(s as never));
    await hydrating;
    await vi.waitFor(() => expect(afterStates.at(-1)?.status).toBe("ready"));

    expect(afterStates.at(-1)?.outcome?.result.scorePercent).toBe(78);
    expect(afterStates.some((s) => s.status === "ready" && s.outcome?.result.scorePercent === 0)).toBe(false);
    expect(afterRequest).not.toHaveBeenCalled();
  });
});

describe("signal analysis across a full reload", () => {
  it("restores cached signals and facts without a new request", async () => {
    const signalOutcome = {
      status: "ok" as const,
      signals: [{ evidenceId: "about:0", section: "about" as const, quote: "Led a team", type: "leadership" as const, strength: "strong" as const, importance: 0.9, metrics: [] }],
      facts: [{ text: "Led a team", evidenceId: "about:0" }],
    };
    const signalProfile = { ...EMPTY_PROFILE, name: "Jordan", about: "Led a team", extracted: true };
    const first = await import("./signalAnalysisController");
    const states: string[] = [];
    const before = new first.SignalAnalysisController({
      onChange: (s) => states.push(s.status),
      request: () => ({ requestId: "r", promise: Promise.resolve(signalOutcome), cancel: vi.fn() }),
      debounceMs: 0,
    });
    before.update({ profileKey: "jordan", profile: signalProfile });
    await vi.waitFor(() => expect(states.at(-1)).toBe("ready"));

    vi.resetModules();
    const second = await import("./signalAnalysisController");
    const hydrating = second.hydrateSignalCache();
    const request = vi.fn();
    const after = new second.SignalAnalysisController({ onChange: () => {}, request, debounceMs: 0 });
    after.update({ profileKey: "jordan", profile: signalProfile });
    await hydrating;
    await vi.waitFor(() => expect(after.getState().status).toBe("ready"));
    expect(after.getState()).toMatchObject({ facts: [{ text: "Led a team" }] });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("a stale profile reloaded 20 minutes later", () => {
  const realNow = Date.now.bind(Date);
  const later = () => realNow() + 20 * 60 * 1000;
  type Seen = { status: string; updating?: boolean; updateError?: string; outcome?: { result: { scorePercent: number | null } } };

  async function analyzedThenReloaded(requestAfter: () => { requestId: string; promise: Promise<AiAnalysisOutcome>; cancel: () => void }) {
    const first = await import("./aiAnalysisController");
    const states: string[] = [];
    const before = new first.AiAnalysisController({ requestAiAnalysis: () => ({ requestId: "r", promise: Promise.resolve(outcome), cancel: vi.fn() }), debounceMs: 0 });
    before.request(goal, profile, scoreProfileAgainstGoal(goal, profile), (s) => states.push(s.status));
    await vi.waitFor(() => expect(states.at(-1)).toBe("ready"));

    vi.resetModules();
    vi.spyOn(Date, "now").mockImplementation(later);
    const cache = await import("./aiAnalysisCache");
    const second = await import("./aiAnalysisController");
    await cache.hydrateAnalysisCache();
    const request = vi.fn(requestAfter);
    const controller = new second.AiAnalysisController({ requestAiAnalysis: request, debounceMs: 0 });
    const seen: Seen[] = [];
    return { controller, request, seen, onState: (s: unknown) => seen.push(s as Seen) };
  }

  it("shows the old result and sends nothing when the evidence is unchanged", async () => {
    const { controller, request, seen, onState } = await analyzedThenReloaded(() => ({ requestId: "x", promise: Promise.resolve(outcome), cancel: vi.fn() }));
    controller.request(goal, profile, scoreProfileAgainstGoal(goal, profile), onState);
    await vi.waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));
    expect(seen.at(-1)?.outcome?.result.scorePercent).toBe(78);
    expect(request).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("keeps the old result visible and sends one update when the evidence changed", async () => {
    const updated = { ...outcome, result: { ...outcome.result, scorePercent: 85 } };
    const { controller, request, seen, onState } = await analyzedThenReloaded(() => ({ requestId: "x", promise: Promise.resolve(updated), cancel: vi.fn() }));
    controller.request(goal, profile, scoreProfileAgainstGoal(goal, profile), onState);
    await vi.waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));
    const grown = { ...profile, about: "Mentors a robotics team in Python" };
    controller.request(goal, grown, scoreProfileAgainstGoal(goal, grown), onState);
    expect(seen.at(-1)).toMatchObject({ status: "ready", updating: true, outcome: { result: { scorePercent: 78 } } });
    await vi.waitFor(() => expect(seen.at(-1)?.outcome?.result.scorePercent).toBe(85));
    expect(request).toHaveBeenCalledTimes(1);
    expect(seen.some((s) => s.status !== "ready")).toBe(false);
    vi.restoreAllMocks();
  });

  it("keeps the old result when the update fails", async () => {
    const { controller, seen, onState } = await analyzedThenReloaded(() => ({ requestId: "x", promise: Promise.resolve({ status: "unavailable", reason: "openai_error" }), cancel: vi.fn() }));
    controller.request(goal, profile, scoreProfileAgainstGoal(goal, profile), onState);
    await vi.waitFor(() => expect(seen.at(-1)?.status).toBe("ready"));
    const grown = { ...profile, about: "Mentors a robotics team in Python" };
    controller.request(goal, grown, scoreProfileAgainstGoal(goal, grown), onState);
    await vi.waitFor(() => expect(seen.at(-1)?.updateError).toBe("openai_error"));
    expect(seen.at(-1)).toMatchObject({ status: "ready", outcome: { result: { scorePercent: 78 } } });
    vi.restoreAllMocks();
  });

  it("keeps signal facts visible while a stale profile's signals refresh", async () => {
    const facts = [{ text: "Led a team", evidenceId: "about:0" }];
    const signalOutcome = {
      status: "ok" as const,
      signals: [{ evidenceId: "about:0", section: "about" as const, quote: "Led a team", type: "leadership" as const, strength: "strong" as const, importance: 0.9, metrics: [] }],
      facts,
    };
    const signalProfile = { ...EMPTY_PROFILE, name: "Jordan", about: "Led a team", extracted: true };
    const first = await import("./signalAnalysisController");
    const before = new first.SignalAnalysisController({ onChange: () => {}, request: () => ({ requestId: "r", promise: Promise.resolve(signalOutcome), cancel: vi.fn() }), debounceMs: 0 });
    before.update({ profileKey: "jordan", profile: signalProfile });
    await vi.waitFor(() => expect(before.getState().status).toBe("ready"));

    vi.resetModules();
    vi.spyOn(Date, "now").mockImplementation(later);
    const second = await import("./signalAnalysisController");
    await second.hydrateSignalCache();
    const request = vi.fn(() => ({ requestId: "x", promise: new Promise<never>(() => {}), cancel: vi.fn() }));
    const states: { status: string; facts?: unknown; updating?: boolean }[] = [];
    const after = new second.SignalAnalysisController({ onChange: (s) => states.push(s as never), request, debounceMs: 0 });
    after.update({ profileKey: "jordan", profile: signalProfile });
    await vi.waitFor(() => expect(after.getState().status).toBe("ready"));
    expect(request).not.toHaveBeenCalled();

    after.update({ profileKey: "jordan", profile: { ...signalProfile, about: "Led a team of 5" } });
    expect(after.getState()).toMatchObject({ status: "ready", updating: true, facts });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(states.some((s) => s.status === "idle" || s.status === "loading")).toBe(false);
    vi.restoreAllMocks();
  });
});
