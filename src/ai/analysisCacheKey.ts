// Derives the cache key inputs from an already-built analyze-profile request — kept separate
// from aiAnalysisCache.ts's generic key-building so that module stays free of any dependency on
// the request/goal shapes.
import type { Goal } from "../models/goal";
import type { AnalyzeProfileRequestBody } from "./buildAnalyzeRequest";
import { buildCacheKey, hashString } from "./aiAnalysisCache";

export function computeAnalysisCacheKey(goal: Goal, request: AnalyzeProfileRequestBody): string {
  const evidenceHash = hashString(JSON.stringify(request.profile.evidence));
  const goalHash = hashString(JSON.stringify(goal.criteria.map((c) => ({ label: c.label, importance: c.importance }))));
  return buildCacheKey({ profileIdentity: request.profile.identity, evidenceHash, goalHash });
}
