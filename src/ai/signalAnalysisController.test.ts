import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { SignalAnalysisController, buildSignalsRequest, signalsCacheKey, type SignalAnalysisState } from "./signalAnalysisController";
import type { AnalyzeSignalsRequestBody, PendingSignalRequest } from "./signalsClient";
import type { SignalAnalysisOutcome } from "./signalTypes";

function profile(about: string): LinkedInProfile {
  return { ...EMPTY_PROFILE, name: "Jordan", headline: "Engineer", location: "Charlotte", about, extracted: true };
}

const ok: SignalAnalysisOutcome = {
  status: "ok",
  signals: [{ evidenceId: "about:0", section: "about", quote: "Led a team", type: "leadership", strength: "strong", importance: 0.9, metrics: [] }],
  facts: [{ text: "Led a team", evidenceId: "about:0" }],
};

function harness(outcome: SignalAnalysisOutcome | (() => Promise<SignalAnalysisOutcome>) = ok) {
  const states: SignalAnalysisState[] = [];
  const cancel = vi.fn();
  const request = vi.fn((_body: AnalyzeSignalsRequestBody): PendingSignalRequest => ({
    requestId: "r",
    promise: typeof outcome === "function" ? outcome() : Promise.resolve(outcome),
    cancel,
  }));
  const controller = new SignalAnalysisController({ onChange: (s) => states.push(s), request, debounceMs: 100 });
  return { controller, request, cancel, states };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildSignalsRequest", () => {
  it("sends structured evidence without location", () => {
    const body = buildSignalsRequest("jordan", profile("Led a team"))!;
    expect(body.profile.identity).toBe("jordan");
    expect(body.profile.evidence.map((e) => e.id)).toEqual(["headline:0", "about:0"]);
  });

  it("returns null when there is no evidence", () => {
    expect(buildSignalsRequest("jordan", { ...EMPTY_PROFILE })).toBeNull();
  });

  it("changes the cache key when evidence changes", () => {
    const a = signalsCacheKey(buildSignalsRequest("jordan", profile("Led a team"))!);
    const b = signalsCacheKey(buildSignalsRequest("jordan", profile("Led a team of 5"))!);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^signals-v1:jordan:/);
  });
});

describe("SignalAnalysisController", () => {
  it("debounces, then reports ready", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    expect(states.at(-1)).toEqual({ status: "loading" });
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ status: "ready", profileKey: "jordan" });
  });

  it("does not re-request for unchanged evidence", async () => {
    const { controller, request } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    for (let i = 0; i < 5; i++) controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(500);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reuses the cache when returning to a profile", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "sam", profile: profile("Built a robot") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    expect(request).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toMatchObject({ status: "ready", profileKey: "jordan" });
  });

  it("re-requests when evidence changes, keeping the previous result visible meanwhile", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    const count = states.length;
    controller.update({ profileKey: "jordan", profile: profile("Led a team of 5") });
    expect(states.length).toBe(count);
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("shows loading, not the previous profile's signals, on a different profile", () => {
    const { controller, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    controller.update({ profileKey: "sam", profile: profile("Built a robot") });
    expect(states.at(-1)).toEqual({ status: "loading" });
  });

  it("cancels a pending request and drops its late result when superseded", async () => {
    let resolveFirst: (o: SignalAnalysisOutcome) => void = () => {};
    const first = new Promise<SignalAnalysisOutcome>((r) => (resolveFirst = r));
    let calls = 0;
    const { controller, cancel, states } = harness(() => (++calls === 1 ? first : Promise.resolve(ok)));
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "sam", profile: profile("Built a robot") });
    expect(cancel).toHaveBeenCalled();
    resolveFirst(ok);
    await vi.advanceTimersByTimeAsync(100);
    expect(states.filter((s) => s.status === "ready").every((s) => s.status === "ready" && s.profileKey === "sam")).toBe(true);
  });

  it("reports unavailable without faking results", async () => {
    const { controller, states } = harness({ status: "unavailable", reason: "not_configured" });
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    expect(states.at(-1)).toEqual({ status: "unavailable", reason: "not_configured" });
  });

  it("does not retry a failed request for the same evidence", async () => {
    const { controller, request } = harness({ status: "unavailable", reason: "openai_error" });
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("resets to idle and cancels when given no profile", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    controller.update(null);
    await vi.advanceTimersByTimeAsync(200);
    expect(request).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({ status: "idle" });
  });
});

describe("SignalAnalysisController - evidence growth during a request", () => {
  it("never cancels the in-flight request for the same profile and sends one refresh after it", async () => {
    let resolveFirst!: (o: SignalAnalysisOutcome) => void;
    const first = new Promise<SignalAnalysisOutcome>((r) => (resolveFirst = r));
    const cancel = vi.fn();
    const request = vi
      .fn()
      .mockReturnValueOnce({ requestId: "1", promise: first, cancel })
      .mockReturnValue({ requestId: "2", promise: Promise.resolve(ok), cancel: vi.fn() });
    const states: SignalAnalysisState[] = [];
    const controller = new SignalAnalysisController({ onChange: (s) => states.push(s), request, debounceMs: 100 });

    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team of 5") });
    controller.update({ profileKey: "jordan", profile: profile("Led a team of 5 and won") });
    expect(cancel).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);

    resolveFirst(ok);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.filter((s) => s.status === "ready")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(states.filter((s) => s.status === "ready")).toHaveLength(2);
    expect(request).toHaveBeenCalledTimes(2);
    expect((request.mock.calls[1]![0] as AnalyzeSignalsRequestBody).profile.evidence.find((e) => e.section === "about")!.text).toContain("won");
  });

  it("exits loading with a timeout", async () => {
    const cancel = vi.fn();
    const request = vi.fn(() => ({ requestId: "r", promise: new Promise<SignalAnalysisOutcome>(() => {}), cancel }));
    const states: SignalAnalysisState[] = [];
    const controller = new SignalAnalysisController({ onChange: (s) => states.push(s), request, debounceMs: 100, timeoutMs: 1000 });
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(1200);
    expect(states.at(-1)).toEqual({ status: "unavailable", reason: "timeout" });
    expect(cancel).toHaveBeenCalled();
  });
});

describe("signal analysis and match analysis", () => {
  it("run independently, so a slow signal request never delays the match result", async () => {
    const { AiAnalysisController } = await import("./aiAnalysisController");
    const { createGoal, createCriterion } = await import("../models/goal");
    const { scoreProfileAgainstGoal } = await import("../matching/scoreProfile");
    const signals = new SignalAnalysisController({
      onChange: () => {},
      request: () => ({ requestId: "s", promise: new Promise<SignalAnalysisOutcome>(() => {}), cancel: vi.fn() }),
      debounceMs: 10,
    });
    const matchResult = {
      status: "ok" as const,
      model: "m",
      result: { scorePercent: 80, disqualified: false, reasons: [], missing: [], complete: true, profileExtracted: true, confidence: 1 },
      narrative: { strengths: [], gaps: [], experienceAssessment: "relevant" as const, experienceAssessmentReason: "", recommendationReason: "", contactRecommendationReason: "", saveRecommendationReason: "", confidenceLevel: "medium" as const },
    };
    const match = new AiAnalysisController({ requestAiAnalysis: () => ({ requestId: "m", promise: Promise.resolve(matchResult), cancel: vi.fn() }), debounceMs: 10 });
    const goal = { ...createGoal("Mentors"), criteria: [createCriterion("robotics", "MUST_HAVE")] };
    const p = profile("Led a team");
    const matchStates: string[] = [];

    signals.update({ profileKey: "jordan", profile: p });
    match.request(goal, p, scoreProfileAgainstGoal(goal, p), (s) => matchStates.push(s.status));
    await vi.advanceTimersByTimeAsync(20);
    expect(matchStates.at(-1)).toBe("ready");
    expect(signals.getState()).toEqual({ status: "loading" });
  });
});
