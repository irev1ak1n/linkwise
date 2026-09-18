// Decides what the profile-analysis half of the panel should show right now — a pure function
// kept deliberately separate from PanelApp.tsx's React wiring (same reason collectionEngine.ts,
// autoScroll.ts, and aiAnalysisController.ts all live outside React: fully unit-testable with no
// rendering, no timers, no chrome APIs), so its every branch can be exercised directly with
// plain vitest.
//
// The whole point: nothing partial is EVER shown. Not a provisional percentage while collection
// is still settling, not a stale result from the profile the user just navigated away from, not
// an AI-analysis "loading…" caption sitting on top of a real-looking score. Every one of the
// four LOADING sub-stages below is indistinguishable from the others to the user except for its
// label — there is no score, no summary, no strengths/gaps rendered under any of them. The final
// analysis appears exactly once, fully formed, only from the single `ready` stage.
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";
import type { CollectionState } from "../../models/collection";
import type { MatchResult } from "../../matching/scoreProfile";
import type { AiAnalysisState } from "./useAiAnalysis";

export type AnalysisPipelineStage =
  | { kind: "loading"; label: string }
  | { kind: "not_enough_info" }
  | { kind: "failed" }
  | { kind: "ready"; result: MatchResult; aiState: Extract<AiAnalysisState, { status: "ready" } | { status: "unavailable" }> };

export interface AnalysisPipelineInput {
  profile: LinkedInProfile | null;
  collection: CollectionState | null;
  goal: Goal;
  /** `scoreProfileAgainstGoal(goal, profile)` — the caller's job to memoize; null exactly when
   * `profile` is null. */
  result: MatchResult | null;
  aiState: AiAnalysisState;
  /** Whether the caller actually asked `useAiAnalysis` to run for this render — false when
   * there is deliberately nothing worth sending to AI (no criteria to score, or the profile has
   * zero extracted evidence). Without this, an `aiState` left at "idle" because AI was never
   * even requested would be indistinguishable from "about to start" and the UI would wait on it
   * forever. */
  aiExpected: boolean;
  /** Set once the overall pipeline has been stuck in a `loading` stage for longer than the
   * caller's own patience budget (see PanelApp.tsx's PIPELINE_TIMEOUT_MS) — checked first, so a
   * process that genuinely never finishes always resolves to an honest failure instead of
   * spinning forever. */
  timedOut: boolean;
}

/**
 * `goal.criteria.length === 0` (not `!hasScoreableCriteria(goal)`) is the correct "still needs
 * criteria" test here, matching goalStore.ts's `ensureActiveGoalCriteria` exactly: a goal made
 * entirely of EXCLUDED criteria is a deliberate, valid, already-finished configuration — it
 * should score straight through to a null-percent `ready` result (AnalysisView already renders
 * that honestly), never sit in a "still figuring out your goal" loading state that nothing will
 * ever resolve.
 */
export function computeAnalysisPipelineStage(input: AnalysisPipelineInput): AnalysisPipelineStage {
  const { profile, collection, goal, result, aiState, aiExpected, timedOut } = input;

  if (timedOut) return { kind: "failed" };

  if (!profile || !collection) return { kind: "loading", label: "Scanning profile…" };
  if (collection.status !== "settled") return { kind: "loading", label: "Scanning profile…" };

  if (goal.criteria.length === 0) return { kind: "loading", label: "Understanding your goal…" };

  // The scan genuinely found nothing to read at all (a hard failure inside the background scan,
  // or a profile LinkedIn simply won't render anything for) — never fabricate a score from an
  // empty profile; this is the ONLY legitimate route to "not enough info" left in the pipeline.
  if (!profile.extracted) return { kind: "not_enough_info" };

  if (!result) return { kind: "loading", label: "Calculating match…" };

  if (!aiExpected) {
    // Deliberately never requested (e.g. a null-percent result with nothing meaningful to
    // enhance) — resolved by construction, never "idle" masquerading as done.
    return { kind: "ready", result, aiState: { status: "unavailable", reason: "not_applicable" } };
  }
  if (aiState.status === "idle") return { kind: "loading", label: "Calculating match…" };
  if (aiState.status === "loading") return { kind: "loading", label: "Finalizing analysis…" };

  // aiState is genuinely resolved here — "ready" or "unavailable" — nothing left to wait on.
  return { kind: "ready", result, aiState };
}
