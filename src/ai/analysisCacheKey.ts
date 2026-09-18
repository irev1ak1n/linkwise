// Derives the cache key inputs from an already-built analyze-profile request — kept separate
// from aiAnalysisCache.ts's generic key-building so that module stays free of any dependency on
// the request/goal shapes.
import type { Goal } from "../models/goal";
import type { AnalyzeProfileRequestBody } from "./buildAnalyzeRequest";
import { buildCacheKey, hashString } from "./aiAnalysisCache";

export function computeAnalysisCacheKey(goal: Goal, request: AnalyzeProfileRequestBody): string {
  const evidenceHash = hashString(JSON.stringify(request.profile.evidence));
  // Includes `goal.name` (the free-text description sent to OpenAI as `goal.description`) as
  // well as the criteria list — under the AI-first architecture a goal's own text can drive the
  // whole analysis even when criteria are sparse or empty (see backend/src/openai/prompt.ts's
  // holistic-reasoning guidance), so a cache key keyed only on criteria could serve a stale
  // result after the user edits their goal's wording without changing its criteria.
  const goalHash = hashString(JSON.stringify({ name: goal.name, criteria: goal.criteria.map((c) => ({ label: c.label, importance: c.importance })) }));
  return buildCacheKey({ profileIdentity: request.profile.identity, evidenceHash, goalHash });
}
