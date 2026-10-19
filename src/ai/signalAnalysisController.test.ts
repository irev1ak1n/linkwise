import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { SIGNAL_ANALYSIS_VERSION, SignalAnalysisController, buildSignalsRequest, clearSignalCache, signalsCacheKey, type SignalAnalysisState } from "./signalAnalysisController";
import type { AnalyzeSignalsRequestBody, PendingSignalRequest } from "./signalsClient";
import type { GradedCandidateDTO, Grades, SignalClassificationOutcome, SignalFactType } from "./signalTypes";

const NONE: Grades = { impact: 0, ownership: 0, result: 0, scale: 0, selectivity: 0, leadership: 0, technicalDepth: 0, sustainedDepth: 0, specificity: 1, distinctiveness: 0, genericness: 0 };

// What the fake classifier says about each phrase it finds in a submitted item.
const TABLE: Record<string, { type: SignalFactType; grades: Partial<Grades>; goalRelevance?: number }> = {
  "Led a team of 5": { type: "leadership_scope", grades: { leadership: 3, ownership: 2, scale: 1, specificity: 3, distinctiveness: 2 } },
  "Led a team": { type: "leadership_scope", grades: { leadership: 3, ownership: 2, specificity: 2, distinctiveness: 2 } },
  "won 2nd place at the regional conference": { type: "competition_result", grades: { selectivity: 3, result: 2, distinctiveness: 3, specificity: 3, impact: 1 } },
  "Built a robot used by 300 students": { type: "project_ownership", grades: { ownership: 3, technicalDepth: 2, impact: 2, scale: 2, specificity: 3, distinctiveness: 2 } },
  "Took AP Computer Science": { type: "coursework", grades: { technicalDepth: 1, specificity: 2, distinctiveness: 1 }, goalRelevance: 3 },
};

function respond(body: AnalyzeSignalsRequestBody): SignalClassificationOutcome {
  const candidates: GradedCandidateDTO[] = [];
  for (const item of body.profile.evidence) {
    const quotes = Object.keys(TABLE).filter((q) => item.text.includes(q));
    // The longest phrase wins, so "Led a team of 5" is not also read as "Led a team".
    for (const quote of quotes.filter((q) => !quotes.some((o) => o !== q && o.includes(q)))) {
      const { type, grades, goalRelevance = 0 } = TABLE[quote]!;
      candidates.push({ evidenceId: item.id, section: item.section, quote, fact: quote, type, grades: { ...NONE, ...grades }, goalRelevance: body.goal ? goalRelevance : 0, confidence: 0.9, metrics: [] });
    }
  }
  return { status: "ok", careerStage: "student", candidates, classified: body.profile.evidence.map((e) => e.id) };
}

function profile(about: string, extra: Partial<LinkedInProfile> = {}): LinkedInProfile {
  return { ...EMPTY_PROFILE, name: "Jordan", headline: "Engineer", location: "Charlotte", about, extracted: true, ...extra };
}

const experience = (description: string) => ({ experience: [{ title: "Captain", company: "Robotics Club", description }] }) as Partial<LinkedInProfile>;

function harness(outcome?: (body: AnalyzeSignalsRequestBody) => SignalClassificationOutcome | Promise<SignalClassificationOutcome>, seed = 1) {
  const states: SignalAnalysisState[] = [];
  const cancel = vi.fn();
  const request = vi.fn((body: AnalyzeSignalsRequestBody): PendingSignalRequest => ({
    requestId: "r",
    promise: Promise.resolve(outcome ? outcome(body) : respond(body)),
    cancel,
  }));
  const controller = new SignalAnalysisController({ onChange: (s) => states.push(s), request, debounceMs: 100, seed: () => seed, debug: () => {} });
  return { controller, request, cancel, states };
}

const ready = (states: SignalAnalysisState[]) => states.at(-1) as Extract<SignalAnalysisState, { status: "ready" }>;
const quotes = (state: SignalAnalysisState) => (state.status === "ready" ? state.highlights.map((h) => h.quote) : []);

beforeEach(() => {
  vi.useFakeTimers();
  clearSignalCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildSignalsRequest", () => {
  it("sends contract version 3 with gradable evidence only, no headline or location", () => {
    const body = buildSignalsRequest("jordan", profile("Led a team"), "Robotics captains")!;
    expect(body.version).toBe(3);
    expect(body.profile.evidence.map((e) => e.id)).toEqual(["about:0"]);
    expect(body.goal).toEqual({ text: "Robotics captains" });
  });

  it("returns null when there is nothing to grade", () => {
    expect(buildSignalsRequest("jordan", { ...EMPTY_PROFILE })).toBeNull();
  });

  it("changes the plan key with the evidence and with the goal", () => {
    const a = signalsCacheKey(buildSignalsRequest("jordan", profile("Led a team"))!);
    expect(signalsCacheKey(buildSignalsRequest("jordan", profile("Led a team of 5"))!)).not.toBe(a);
    expect(signalsCacheKey(buildSignalsRequest("jordan", profile("Led a team"), "Captains")!)).not.toBe(a);
    expect(a).toMatch(new RegExp(`^${SIGNAL_ANALYSIS_VERSION}:jordan:`));
  });
});

describe("SignalAnalysisController", () => {
  it("debounces one request, then reports highlights ranked locally", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    expect(states.at(-1)).toEqual({ status: "loading" });
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(1);
    expect(ready(states)).toMatchObject({ status: "ready", profileKey: "jordan", source: "ai", updating: false });
    expect(quotes(ready(states))).toEqual(["Led a team"]);
    expect(ready(states).facts).toEqual([{ text: "Led a team", evidenceId: "about:0" }]);
  });

  it("never asks again for unchanged evidence, or when returning to a profile", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    for (let i = 0; i < 5; i++) controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    controller.update({ profileKey: "sam", profile: profile("Built a robot used by 300 students") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    expect(request).toHaveBeenCalledTimes(2);
    expect(quotes(ready(states))).toEqual(["Led a team"]);
  });

  it("grades only newly loaded items, sending the rest as short context", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team", experience("Built a robot used by 300 students")) });
    expect(ready(states)).toMatchObject({ updating: true });
    expect(quotes(ready(states))).toEqual(["Led a team"]);
    await vi.advanceTimersByTimeAsync(100);
    const second = request.mock.calls[1]![0];
    expect(second.profile.evidence.map((e) => e.section)).toEqual(["experience"]);
    expect(second.profile.context).toEqual([{ section: "about", text: "Led a team" }]);
    expect(quotes(ready(states)).sort()).toEqual(["Built a robot used by 300 students", "Led a team"]);
  });

  it("drops a removed fact at once, without waiting for any request", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team", experience("Built a robot used by 300 students")) });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    expect(quotes(ready(states))).toEqual(["Led a team"]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("regrades an edited item instead of keeping its old grades", async () => {
    const { controller, request, states } = harness();
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: profile("Led a team of 5") });
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(2);
    expect(quotes(ready(states))).toEqual(["Led a team of 5"]);
  });

  it("regrades for a new goal once, and reuses each goal's grades afterwards", async () => {
    const { controller, request } = harness();
    const p = profile("Led a team");
    controller.update({ profileKey: "jordan", profile: p, goalText: null });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "jordan", profile: p, goalText: "Robotics captains" });
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]![0].goal).toEqual({ text: "Robotics captains" });
    controller.update({ profileKey: "jordan", profile: p, goalText: null });
    controller.update({ profileKey: "jordan", profile: p, goalText: "Robotics captains" });
    await vi.advanceTimersByTimeAsync(200);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("falls back to local heuristics when grading is unavailable, and does not retry the same items", async () => {
    const { controller, request, states } = harness(() => ({ status: "unavailable", reason: "openai_error" }));
    controller.update({ profileKey: "jordan", profile: profile("Led a team of volunteers at the food bank") });
    await vi.advanceTimersByTimeAsync(100);
    expect(ready(states)).toMatchObject({ status: "ready", source: "heuristic", updateError: "openai_error" });
    expect(quotes(ready(states))).toEqual(["Led a team of volunteers at the food bank"]);
    controller.update({ profileKey: "jordan", profile: profile("Led a team of volunteers at the food bank") });
    await vi.advanceTimersByTimeAsync(200);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("falls back the same way on a timeout, cancelling the request", async () => {
    const cancel = vi.fn();
    const request = vi.fn(() => ({ requestId: "r", promise: new Promise<SignalClassificationOutcome>(() => {}), cancel }));
    const states: SignalAnalysisState[] = [];
    const controller = new SignalAnalysisController({ onChange: (s) => states.push(s), request, debounceMs: 100, timeoutMs: 1000, debug: () => {} });
    controller.update({ profileKey: "jordan", profile: profile("Led a team of volunteers") });
    await vi.advanceTimersByTimeAsync(1200);
    expect(ready(states)).toMatchObject({ source: "heuristic", updateError: "timeout" });
    expect(cancel).toHaveBeenCalled();
  });

  it("shows loading on a different profile, cancels its pending request, and drops the late result", async () => {
    let resolveFirst: (o: SignalClassificationOutcome) => void = () => {};
    let calls = 0;
    const { controller, cancel, states } = harness((body) => (++calls === 1 ? new Promise((r) => (resolveFirst = r)) : respond(body)));
    controller.update({ profileKey: "jordan", profile: profile("Led a team") });
    await vi.advanceTimersByTimeAsync(100);
    controller.update({ profileKey: "sam", profile: profile("Built a robot used by 300 students") });
    expect(states.at(-1)).toEqual({ status: "loading" });
    expect(cancel).toHaveBeenCalled();
    resolveFirst(respond(buildSignalsRequest("jordan", profile("Led a team"))!));
    await vi.advanceTimersByTimeAsync(100);
    expect(states.filter((s) => s.status === "ready").every((s) => s.status === "ready" && s.profileKey === "sam")).toBe(true);
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

describe("SignalAnalysisController - stability", () => {
  const rich = profile("Led a team of 5. Took AP Computer Science.", experience("We won 2nd place at the regional conference. Built a robot used by 300 students."));

  it("gives identical core highlights for identical evidence and goal, whatever the discovery seed", async () => {
    const runs: string[][] = [];
    for (const seed of [1, 7, 42]) {
      clearSignalCache();
      const { controller, states } = harness(undefined, seed);
      controller.update({ profileKey: "jordan", profile: rich, goalText: "Developers" });
      await vi.advanceTimersByTimeAsync(100);
      runs.push(ready(states).highlights.filter((h) => h.type === "core").map((h) => h.quote));
    }
    expect(runs[0]!.length).toBeGreaterThan(0);
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });

  it("ranks the competition result and the shipped project above the coursework, even for a matching goal", async () => {
    const { controller, states } = harness();
    controller.update({ profileKey: "jordan", profile: rich, goalText: "Computer science students" });
    await vi.advanceTimersByTimeAsync(100);
    const order = ready(states).ranking.debug.map((r) => r.quote);
    expect(order.indexOf("won 2nd place at the regional conference")).toBeLessThan(order.indexOf("Took AP Computer Science"));
    expect(order.indexOf("Built a robot used by 300 students")).toBeLessThan(order.indexOf("Took AP Computer Science"));
    expect(ready(states).highlights.find((h) => h.quote === "Took AP Computer Science")?.type).not.toBe("core");
  });
});

describe("signal analysis and match analysis", () => {
  it("run independently, so a slow signal request never delays the match result", async () => {
    const { AiAnalysisController } = await import("./aiAnalysisController");
    const { createGoal, createCriterion } = await import("../models/goal");
    const { scoreProfileAgainstGoal } = await import("../matching/scoreProfile");
    const signals = new SignalAnalysisController({
      onChange: () => {},
      request: () => ({ requestId: "s", promise: new Promise<SignalClassificationOutcome>(() => {}), cancel: vi.fn() }),
      debounceMs: 10,
      debug: () => {},
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
