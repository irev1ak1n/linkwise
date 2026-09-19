// An in-memory cache and in-flight-request map for AI analysis results, kept client-side.
// Clears on every content-script reload, which is fine for now.
import type { AiAnalysisOutcome } from "./apiTypes";

// Bump this whenever the analysis contract changes, so old cached results never get served
// under a new contract.
const ANALYSIS_VERSION = "v2";

export interface CacheKeyInput {
  profileIdentity: string;
  evidenceHash: string;
  goalHash: string;
}

// Key = profile identity + evidence hash + goal hash + version. New evidence naturally
// invalidates old entries by producing a different key.
export function buildCacheKey(input: CacheKeyInput): string {
  return `${ANALYSIS_VERSION}:${input.profileIdentity}:${input.evidenceHash}:${input.goalHash}`;
}

// A fast, non-cryptographic hash (FNV-1a), just enough to tell "changed" from "didn't".
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

// If a request for this key is already in flight, reuse it instead of starting a second one.
export function getOrStartInFlight(key: string, start: () => Promise<AiAnalysisOutcome>): Promise<AiAnalysisOutcome> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing;
  const promise = start().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

/** For tests, resets both maps between cases. */
export function clearAiAnalysisCache(): void {
  resultCache.clear();
  inFlightRequests.clear();
}
