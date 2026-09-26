import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAnalysisController } from "./aiAnalysisController";
import { clearAiAnalysisCache, setCachedAnalysis } from "./aiAnalysisCache";
import { computeAnalysisCacheKey } from "./analysisCacheKey";
import { buildAnalyzeProfileRequest } from "./buildAnalyzeRequest";
import { scoreProfileAgainstGoal } from "../matching/scoreProfile";
import { createCriterion, createGoal, type Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { PendingAiRequest } from "./analyzeProfileClient";
import type { AiAnalysisOutcome } from "./apiTypes";

function profile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
  return {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    organizations: [],
    volunteering: [],
    languages: [],
    honors: [],
    extracted: true,
    ...overrides,
  };
}

function readyOutcome(): Extract<AiAnalysisOutcome, { status: "ok" }> {
  return {
    status: "ok",
    model: "test-model",
    result: { scorePercent: 80, disqualified: false, reasons: [], missing: [], complete: true, profileExtracted: true, confidence: 1 },
    narrative: {
      strengths: [],
      gaps: [],
      experienceAssessment: "relevant",
      experienceAssessmentReason: "x",
      recommendationReason: "x",
      contactRecommendationReason: "x",
      saveRecommendationReason: "x",
      confidenceLevel: "medium",
    },
  };
}

function makePendingRequest(promise: Promise<AiAnalysisOutcome>): { pending: PendingAiRequest; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  return { pending: { requestId: "r1", promise, cancel }, cancel };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearAiAnalysisCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AiAnalysisController - debounce", () => {
  it("does not call requestAiAnalysis until the debounce window elapses", () => {
    const requestAiAnalysis = vi.fn(() => makePendingRequest(new Promise(() => {})).pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 500 });
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);

    controller.request(goal, p, result, vi.fn());
    expect(requestAiAnalysis).not.toHaveBeenCalled();

    vi.advanceTimersByTime(499);
    expect(requestAiAnalysis).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(requestAiAnalysis).toHaveBeenCalledTimes(1);
  });

  it("collapses rapid successive requests into a single call once things settle", () => {
    const requestAiAnalysis = vi.fn(() => makePendingRequest(new Promise(() => {})).pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 500 });
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);

    controller.request(goal, p, result, vi.fn());
    vi.advanceTimersByTime(200);
    controller.request(goal, p, result, vi.fn()); // re-triggered before the first debounce fired
    vi.advanceTimersByTime(200);
    controller.request(goal, p, result, vi.fn());
    vi.advanceTimersByTime(500);

    expect(requestAiAnalysis).toHaveBeenCalledTimes(1);
  });

  it("reports a loading state immediately, before the debounce window elapses", () => {
    const requestAiAnalysis = vi.fn(() => makePendingRequest(new Promise(() => {})).pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 500 });
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);

    const onStateChange = vi.fn();
    controller.request(goal, p, result, onStateChange);
    expect(onStateChange).toHaveBeenCalledWith({ status: "loading" });
  });
});

describe("AiAnalysisController - cache", () => {
  it("resolves instantly from the cache without any debounce delay or network call", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);
    const requestBody = buildAnalyzeProfileRequest(goal, p, result);
    const cacheKey = computeAnalysisCacheKey(goal, requestBody);
    const outcome = readyOutcome();
    setCachedAnalysis(cacheKey, outcome);

    const requestAiAnalysis = vi.fn();
    const controller = new AiAnalysisController({ requestAiAnalysis });
    const onStateChange = vi.fn();
    controller.request(goal, p, result, onStateChange);

    expect(onStateChange).toHaveBeenCalledWith({ status: "ready", outcome });
    expect(requestAiAnalysis).not.toHaveBeenCalled();
  });
});

describe("AiAnalysisController - stale result handling", () => {
  it("ignores a resolved outcome that arrives after a newer request has superseded it (profile navigation)", async () => {
    const goalA: Goal = { ...createGoal("A"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const goalB: Goal = { ...createGoal("B"), criteria: [createCriterion("Java", "MUST_HAVE")] };
    const p = profile({ skills: ["Python", "Java"] });
    const resultA = scoreProfileAgainstGoal(goalA, p);
    const resultB = scoreProfileAgainstGoal(goalB, p);

    let resolveFirst!: (o: AiAnalysisOutcome) => void;
    const firstPromise = new Promise<AiAnalysisOutcome>((resolve) => {
      resolveFirst = resolve;
    });
    const requestAiAnalysis = vi
      .fn()
      .mockReturnValueOnce(makePendingRequest(firstPromise).pending)
      .mockReturnValueOnce(makePendingRequest(Promise.resolve(readyOutcome())).pending);

    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 100 });
    const onStateChange = vi.fn();

    controller.request(goalA, p, resultA, onStateChange);
    vi.advanceTimersByTime(100); // fires the first (stale-to-be) request

    controller.request(goalB, p, resultB, onStateChange); // supersedes before the first resolves
    vi.advanceTimersByTime(100);
    await vi.waitFor(() => expect(requestAiAnalysis).toHaveBeenCalledTimes(2));

    onStateChange.mockClear();
    resolveFirst({ status: "unavailable", reason: "late_and_stale" });
    await Promise.resolve();
    await Promise.resolve();

    expect(onStateChange).not.toHaveBeenCalledWith(expect.objectContaining({ reason: "late_and_stale" }));
  });

  it("falls back to 'unavailable' instead of hanging forever if the request promise unexpectedly rejects", async () => {
    // requestAiAnalysis should always resolve, but this is the safety net, a real incident
    // where an orphaned context throwing synchronously left the UI stuck loading forever.
    const requestAiAnalysis = vi.fn(() => makePendingRequest(Promise.reject(new Error("unexpected"))).pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 100 });
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);

    const onStateChange = vi.fn();
    controller.request(goal, p, result, onStateChange);
    vi.advanceTimersByTime(100);
    await vi.waitFor(() => expect(onStateChange).toHaveBeenCalledWith({ status: "unavailable", reason: "unexpected_error" }));
  });

  it("cancels a still-in-flight request as soon as a new request() call comes in", () => {
    const requestAiAnalysis = vi.fn(() => makePendingRequest(new Promise(() => {})).pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 100 });
    const goalA = { ...createGoal("A"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const goalB = { ...createGoal("B"), criteria: [createCriterion("Java", "MUST_HAVE")] };
    const p = profile({ skills: ["Python", "Java"] });

    controller.request(goalA, p, scoreProfileAgainstGoal(goalA, p), vi.fn());
    vi.advanceTimersByTime(100);
    const firstCall = requestAiAnalysis.mock.results[0]!.value as PendingAiRequest;

    controller.request(goalB, p, scoreProfileAgainstGoal(goalB, p), vi.fn()); // a goal change supersedes the first
    expect(firstCall.cancel).toHaveBeenCalled();
  });
});

describe("AiAnalysisController - evidence growth during a request", () => {
  const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };

  function deferred() {
    let resolve!: (o: AiAnalysisOutcome) => void;
    const promise = new Promise<AiAnalysisOutcome>((r) => (resolve = r));
    return { promise, resolve };
  }

  it("does not resend or cancel when the same evidence arrives as a new object", () => {
    const { pending, cancel } = makePendingRequest(new Promise(() => {}));
    const requestAiAnalysis = vi.fn(() => pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 100 });
    controller.request(goal, profile({ skills: ["Python"] }), scoreProfileAgainstGoal(goal, profile({ skills: ["Python"] })), vi.fn());
    vi.advanceTimersByTime(100);
    for (let i = 0; i < 5; i++) {
      const same = profile({ skills: ["Python"] });
      controller.request(goal, same, scoreProfileAgainstGoal(goal, same), vi.fn());
      vi.advanceTimersByTime(1000);
    }
    expect(requestAiAnalysis).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps the in-flight request, shows its result, then sends one refresh with the newest evidence", async () => {
    const first = deferred();
    const second = deferred();
    const cancels = [vi.fn(), vi.fn()];
    const requestAiAnalysis = vi
      .fn()
      .mockReturnValueOnce({ requestId: "1", promise: first.promise, cancel: cancels[0] })
      .mockReturnValueOnce({ requestId: "2", promise: second.promise, cancel: cancels[1] });
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 100 });
    const states: string[] = [];
    const onState = (s: { status: string }) => states.push(s.status);

    const small = profile({ skills: ["Python"] });
    controller.request(goal, small, scoreProfileAgainstGoal(goal, small), onState);
    vi.advanceTimersByTime(100);
    for (const skills of [["Python", "Java"], ["Python", "Java", "Go"]]) {
      const bigger = profile({ skills });
      controller.request(goal, bigger, scoreProfileAgainstGoal(goal, bigger), onState);
    }
    expect(cancels[0]).not.toHaveBeenCalled();

    first.resolve(readyOutcome());
    await vi.advanceTimersByTimeAsync(100);
    expect(states).toEqual(["loading", "ready"]);
    expect(requestAiAnalysis).toHaveBeenCalledTimes(2);
    expect((requestAiAnalysis.mock.calls[1]![0] as { profile: { evidence: { text: string }[] } }).profile.evidence.at(-1)!.text).toContain("Go");

    second.resolve(readyOutcome());
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual(["loading", "ready", "ready"]);
  });

  it("exits loading with a timeout and cancels the request", async () => {
    const { pending, cancel } = makePendingRequest(new Promise(() => {}));
    const controller = new AiAnalysisController({ requestAiAnalysis: vi.fn(() => pending), debounceMs: 100, timeoutMs: 5000 });
    const onState = vi.fn();
    const p = profile({ skills: ["Python"] });
    controller.request(goal, p, scoreProfileAgainstGoal(goal, p), onState);
    await vi.advanceTimersByTimeAsync(5100);
    expect(onState).toHaveBeenLastCalledWith({ status: "unavailable", reason: "timeout" });
    expect(cancel).toHaveBeenCalled();
  });

  it("retries after a failure", async () => {
    const requestAiAnalysis = vi
      .fn()
      .mockReturnValueOnce(makePendingRequest(Promise.resolve({ status: "unavailable", reason: "timeout" })).pending)
      .mockReturnValueOnce(makePendingRequest(Promise.resolve(readyOutcome())).pending);
    const controller = new AiAnalysisController({ requestAiAnalysis, debounceMs: 100 });
    const onState = vi.fn();
    const p = profile({ skills: ["Python"] });
    controller.request(goal, p, scoreProfileAgainstGoal(goal, p), onState);
    await vi.advanceTimersByTimeAsync(100);
    expect(onState).toHaveBeenLastCalledWith({ status: "unavailable", reason: "timeout" });
    controller.retry(goal, p, scoreProfileAgainstGoal(goal, p), onState);
    await vi.advanceTimersByTimeAsync(100);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ status: "ready" }));
  });

  it("builds the same cache key for equal evidence in different objects", () => {
    const a = profile({ skills: ["Python"] });
    const b = profile({ skills: ["Python"] });
    const keyA = computeAnalysisCacheKey(goal, buildAnalyzeProfileRequest(goal, a, scoreProfileAgainstGoal(goal, a)));
    const keyB = computeAnalysisCacheKey(goal, buildAnalyzeProfileRequest(goal, b, scoreProfileAgainstGoal(goal, b)));
    expect(keyA).toBe(keyB);
  });
});
