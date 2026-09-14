// Glues the guardrail-merged per-criterion assessments into the SAME deterministic scoring core
// the extension's local-only path uses (`computeMatchResult`, see
// ../../src/matching/scoreProfile.ts) — reused, not reimplemented, exactly as the mission asks.
import { computeMatchResult, type MatchResult } from "../../src/matching/scoreProfile";
import type { Goal } from "../../src/models/goal";
import type { AnalyzeProfileRequest } from "./validation/requestSchema";
import type { MergeResult } from "./guardrails/mergeCriterionAssessments";

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

export function computeFinalScore(request: AnalyzeProfileRequest, merge: MergeResult): MatchResult {
  return computeMatchResult(goalFromRequest(request), merge.assessments, request.localAnalysis.profileExtracted);
}
