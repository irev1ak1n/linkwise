// A small in-memory cache + in-flight-request map for AI analysis results — kept in the
// extension (not server-side) per the mission's own "prefer keeping this cache locally in the
// extension for now, do not create a persistent server-side database." Living in memory means
// it naturally clears on every content-script (re)injection, which is an acceptable cost for
// this milestone in exchange for zero added storage/infrastructure.
import type { AiAnalysisOutcome } from "./apiTypes";

const ANALYSIS_VERSION = "v1";

export interface CacheKeyInput {
  profileIdentity: string;
  evidenceHash: string;
  goalHash: string;
}

/** Cache key = profile identity + a hash of the profile evidence + a hash of the goal/criteria
 * + a fixed analysis-version tag — bump ANALYSIS_VERSION if the request/response contract ever
 * changes in a way that should invalidate every previously-cached result. Updated profile
 * evidence naturally invalidates old entries just by producing a different key — no separate
 * invalidation step is needed. The backend's model isn't part of the key: the client doesn't
 * know which model will answer until the response comes back, and this cache is short-lived
 * (in-memory, per content-script instance) enough that a mid-session model change is not a
 * realistic concern for this milestone. */
export function buildCacheKey(input: CacheKeyInput): string {
  return `${ANALYSIS_VERSION}:${input.profileIdentity}:${input.evidenceHash}:${input.goalHash}`;
}

/** A small, fast, non-cryptographic string hash (FNV-1a) — good enough to tell "this
 * evidence/goal changed" from "it didn't," which is all a cache key needs; no security
 * property is required for a purely in-memory, same-origin cache. */
export function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

type ReadyOutcome = Extract<AiAnalysisOutcome, { status: "ok" }>;

const resultCache = new Map<string, ReadyOutcome>();
const inFlightRequests = new Map<string, Promise<AiAnalysisOutcome>>();

export function getCachedAnalysis(key: string): ReadyOutcome | undefined {
  return resultCache.get(key);
}

export function setCachedAnalysis(key: string, value: ReadyOutcome): void {
  resultCache.set(key, value);
}

/**
 * Request deduplication: if a request for this exact key is already in flight, returns the
 * SAME promise instead of starting a second one — two callers racing for the same
 * profile/goal combination (e.g. a re-render firing the effect twice) share one network call.
 */
export function getOrStartInFlight(key: string, start: () => Promise<AiAnalysisOutcome>): Promise<AiAnalysisOutcome> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;
  const promise = start().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

/** Exposed for tests — resets both maps to a clean slate between test cases. */
export function clearAiAnalysisCache(): void {
  resultCache.clear();
  inFlightRequests.clear();
}
