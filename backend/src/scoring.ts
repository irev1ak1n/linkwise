// AI-first scoring: OpenAI's own `matchPercent`/`confidenceLevel` are the final numbers shown to
// the user — the deterministic weighted-average engine (`computeMatchResult`, see
// ../../src/matching/scoreProfile.ts) is now used only to derive `disqualified`/`reasons`/
// `missing`/`complete` from the guardrail-merged per-criterion assessments (still evidence-
// grounded exactly as before), never to compute the headline percentage when AI succeeds. The
// ONE guardrail that can still override AI's own score is a confirmed Excluded disqualification
// — `computeMatchResult` already returns that as an early, unconditional result (scorePercent 0,
// disqualified true), so this only ever overrides the non-disqualified branch.
import { computeMatchResult, type MatchResult } from "../../src/matching/scoreProfile";
import type { Goal } from "../../src/models/goal";
import type { AnalyzeProfileRequest } from "./validation/requestSchema";
import type { MergeResult } from "./guardrails/mergeCriterionAssessments";
import type { AnalysisResponse, ConfidenceLevel } from "./openai/responseSchema";

/** computeMatchResult only ever reads `goal.criteria` (each criterion's id/importance) — never
 * `goal.name` or `goal.notes` — so this reconstruction only needs to round-trip what scoring
 * actually uses, not the full Goal shape the extension keeps in storage. */
function goalFromRequest(request: AnalyzeProfileRequest): Goal {
  return {
    id: request.goal.id,
    name: request.goal.description,
    criteria: request.goal.criteria.map((c) => ({ id: c.id, label: c.label, importance: c.importance, category: c.category })),
  };
}

/** Maps OpenAI's own categorical judgment of evidence completeness onto the extension's existing
 * 0-1 `MatchResult.confidence` scale, calibrated against matchColors.ts's own
 * `LOW_CONFIDENCE_THRESHOLD` (0.4): "low" lands below it (shown as "Limited profile information"
 * rather than a bare percentage), "medium"/"high" land safely above it (shown as a normal colored
 * score — a Medium-confidence 82% match is a valid, real result, not a caveated one). */
export function confidenceLevelToFloat(level: ConfidenceLevel): number {
  switch (level) {
    case "low":
      return 0.2;
    case "medium":
      return 0.65;
    case "high":
      return 0.95;
  }
}

/** A last-resort clamp — Structured Outputs plus the request-side zod schema (`matchPercent:
 * z.number().int().min(0).max(100)`) should already guarantee this, but a scoring function
 * should never trust a single upstream layer to keep a displayed percentage in range. */
function clampScorePercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function computeFinalScore(request: AnalyzeProfileRequest, merge: MergeResult, aiResponse: AnalysisResponse): MatchResult {
  const deterministic = computeMatchResult(goalFromRequest(request), merge.assessments, request.localAnalysis.profileExtracted);

  // A confirmed Excluded disqualification is a hard guardrail — AI never gets to overrule it,
  // no matter how enthusiastic its own matchPercent was.
  if (deterministic.disqualified) return deterministic;

  return {
    ...deterministic,
    scorePercent: clampScorePercent(aiResponse.matchPercent),
    confidence: confidenceLevelToFloat(aiResponse.confidenceLevel),
  };
}
