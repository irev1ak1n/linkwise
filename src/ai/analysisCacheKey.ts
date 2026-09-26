// Builds cache key inputs from an analyze-profile request, kept separate from
// aiAnalysisCache.ts so that module stays free of goal/request shapes.
import type { Goal } from "../models/goal";
import type { AnalyzeProfileRequestBody } from "./buildAnalyzeRequest";
import { buildCacheKey, hashString } from "./aiAnalysisCache";

export function computeAnalysisCacheKey(goal: Goal, request: AnalyzeProfileRequestBody): string {
  const evidenceHash = hashString(JSON.stringify(request.profile.evidence));
  // Includes goal.name since AI can reason from that text alone even with sparse criteria,
  // so editing the goal's wording must invalidate the cache too.
  const goalHash = hashString(JSON.stringify({ name: goal.name, criteria: goal.criteria.map((c) => ({ label: c.label, importance: c.importance })) }));
  return buildCacheKey({ profileIdentity: request.profile.identity, evidenceHash, goalHash });
}

// Same profile and goal, regardless of how much evidence has been collected so far.
export function analysisSubjectKey(goal: Goal, request: AnalyzeProfileRequestBody): string {
  return computeAnalysisCacheKey(goal, { ...request, profile: { ...request.profile, evidence: [] } });
}
