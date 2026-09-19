// AI-first scoring: OpenAI's matchPercent/confidenceLevel are the final numbers shown to the
// user. computeMatchResult still derives disqualified/reasons/missing/complete from the merged
// assessments, but no longer computes the headline percentage. A confirmed Excluded
// disqualification is the one thing that can still override AI's score.
import { computeMatchResult, type MatchResult } from "../../src/matching/scoreProfile";
import type { Goal } from "../../src/models/goal";
import type { AnalyzeProfileRequest } from "./validation/requestSchema";
import type { MergeResult } from "./guardrails/mergeCriterionAssessments";
import type { AnalysisResponse, ConfidenceLevel } from "./openai/responseSchema";

// computeMatchResult only reads goal.criteria, so this only rebuilds that much.
function goalFromRequest(request: AnalyzeProfileRequest): Goal {
  return {
    id: request.goal.id,
    name: request.goal.description,
    criteria: request.goal.criteria.map((c) => ({ id: c.id, label: c.label, importance: c.importance, category: c.category })),
  };
}

// Maps confidenceLevel onto the 0-1 confidence scale the UI already uses.
// "low" falls below the low-confidence threshold, "medium"/"high" don't.
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

// Last-resort clamp, in case something upstream ever slips past 0-100.
function clampScorePercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function computeFinalScore(request: AnalyzeProfileRequest, merge: MergeResult, aiResponse: AnalysisResponse): MatchResult {
  const deterministic = computeMatchResult(goalFromRequest(request), merge.assessments, request.localAnalysis.profileExtracted);

  // A confirmed Excluded disqualification always wins, no matter what AI scored.
  if (deterministic.disqualified) return deterministic;

  return {
    ...deterministic,
    scorePercent: clampScorePercent(aiResponse.matchPercent),
    confidence: confidenceLevelToFloat(aiResponse.confidenceLevel),
  };
}
