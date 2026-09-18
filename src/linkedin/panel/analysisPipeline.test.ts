import { describe, expect, it } from "vitest";
import { computeAnalysisPipelineStage, type AnalysisPipelineInput } from "./analysisPipeline";
import { createCriterion, createGoal, type Goal } from "../../models/goal";
import { EMPTY_PROFILE, type LinkedInProfile } from "../../models/profile";
import { initialCollectionState, type CollectionState } from "../../models/collection";
import type { MatchResult } from "../../matching/scoreProfile";

function goalWith(criteria: Goal["criteria"]): Goal {
  return { ...createGoal("Test goal"), criteria };
}

function profile(extracted = true): LinkedInProfile {
  return { ...EMPTY_PROFILE, extracted, name: extracted ? "Alex Chen" : undefined };
}

function settledCollection(): CollectionState {
  return { ...initialCollectionState(0), status: "settled", reachedDocumentEnd: true };
}

function collectingCollection(): CollectionState {
  return initialCollectionState(0);
}

function result(scorePercent: number | null): MatchResult {
  return { scorePercent, disqualified: false, reasons: [], missing: [], complete: true, profileExtracted: true, confidence: 1 };
}

const narrative = {
  strengths: [],
  gaps: [],
  experienceAssessment: "limited" as const,
  experienceAssessmentReason: "",
  recommendationReason: "",
  contactRecommendationReason: "",
  saveRecommendationReason: "",
};

const base: AnalysisPipelineInput = {
  profile: profile(),
  collection: settledCollection(),
  goal: goalWith([createCriterion("Python", "MUST_HAVE")]),
  result: result(80),
  aiState: { status: "ready", outcome: { status: "ok", model: "test", result: result(80), narrative } },
  aiExpected: true,
  timedOut: false,
};

describe("computeAnalysisPipelineStage", () => {
  it("times out to 'failed' while still loading (e.g. AI request still in flight)", () => {
    expect(computeAnalysisPipelineStage({ ...base, aiState: { status: "loading" }, timedOut: true })).toEqual({
      kind: "failed",
    });
  });

  it("never demotes an already-ready stage back to 'failed' just because the panel stayed open past the timeout — a valid Match % must survive", () => {
    expect(computeAnalysisPipelineStage({ ...base, timedOut: true })).toEqual(
      computeAnalysisPipelineStage({ ...base, timedOut: false }),
    );
    expect(computeAnalysisPipelineStage({ ...base, timedOut: true }).kind).toBe("ready");
  });

  it("never demotes an already-resolved not_enough_info stage back to 'failed' on a stale timeout", () => {
    expect(computeAnalysisPipelineStage({ ...base, profile: profile(false), timedOut: true })).toEqual({
      kind: "not_enough_info",
    });
  });

  it("loads with 'Scanning profile…' while profile/collection haven't arrived yet", () => {
    expect(computeAnalysisPipelineStage({ ...base, profile: null, collection: null })).toEqual({
      kind: "loading",
      label: "Scanning profile…",
    });
  });

  it("loads with 'Scanning profile…' while collection is still collecting", () => {
    expect(computeAnalysisPipelineStage({ ...base, collection: collectingCollection() })).toEqual({
      kind: "loading",
      label: "Scanning profile…",
    });
  });

  it("loads with 'Understanding your goal…' when the goal has zero criteria at all", () => {
    expect(computeAnalysisPipelineStage({ ...base, goal: goalWith([]) })).toEqual({
      kind: "loading",
      label: "Understanding your goal…",
    });
  });

  it("does NOT treat an all-EXCLUDED goal as 'still needs criteria' — it's a deliberate, finished configuration", () => {
    const excludedOnly = goalWith([createCriterion("recruiter", "EXCLUDED")]);
    const stage = computeAnalysisPipelineStage({ ...base, goal: excludedOnly, result: result(null), aiExpected: false });
    expect(stage.kind).toBe("ready");
  });

  it("resolves to not_enough_info when the scan settled but genuinely extracted nothing", () => {
    expect(computeAnalysisPipelineStage({ ...base, profile: profile(false) })).toEqual({ kind: "not_enough_info" });
  });

  it("loads with 'Calculating match…' once criteria/evidence are ready but the local result hasn't been computed yet", () => {
    expect(computeAnalysisPipelineStage({ ...base, result: null })).toEqual({ kind: "loading", label: "Calculating match…" });
  });

  it("loads with 'Calculating match…' while AI is expected but still idle (about to be requested)", () => {
    expect(computeAnalysisPipelineStage({ ...base, aiState: { status: "idle" } })).toEqual({
      kind: "loading",
      label: "Calculating match…",
    });
  });

  it("loads with 'Finalizing analysis…' while the AI request is actually in flight", () => {
    expect(computeAnalysisPipelineStage({ ...base, aiState: { status: "loading" } })).toEqual({
      kind: "loading",
      label: "Finalizing analysis…",
    });
  });

  it("is ready once AI resolves successfully", () => {
    const stage = computeAnalysisPipelineStage(base);
    expect(stage.kind).toBe("ready");
    if (stage.kind === "ready") {
      expect(stage.aiState.status).toBe("ready");
      expect(stage.result.scorePercent).toBe(80);
    }
  });

  it("is ready once AI resolves as unavailable — never waits forever on a failed AI call", () => {
    const stage = computeAnalysisPipelineStage({ ...base, aiState: { status: "unavailable", reason: "no_response" } });
    expect(stage.kind).toBe("ready");
    if (stage.kind === "ready") expect(stage.aiState).toEqual({ status: "unavailable", reason: "no_response" });
  });

  it("is ready immediately, with a synthetic unavailable aiState, when AI was never expected to run", () => {
    const stage = computeAnalysisPipelineStage({ ...base, aiExpected: false, aiState: { status: "idle" } });
    expect(stage.kind).toBe("ready");
    if (stage.kind === "ready") expect(stage.aiState.status).toBe("unavailable");
  });

  it("never reaches 'ready' merely because criteria are missing — that's always a loading (or eventually failed) stage, never a finished one", () => {
    const stage = computeAnalysisPipelineStage({ ...base, goal: goalWith([]) });
    expect(stage.kind).not.toBe("ready");
    expect(stage.kind).not.toBe("not_enough_info");
  });
});
