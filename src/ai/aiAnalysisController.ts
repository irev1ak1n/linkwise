// The debounce/cache/cancellation logic behind AI analysis. A plain class, not a hook,
// so it can be tested with fake timers without any React rendering.
import type { Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { MatchResult } from "../matching/scoreProfile";
import { buildAnalyzeProfileRequest } from "./buildAnalyzeRequest";
import { requestAiAnalysis as defaultRequestAiAnalysis, type PendingAiRequest } from "./analyzeProfileClient";
import { computeAnalysisCacheKey } from "./analysisCacheKey";
import { getCachedAnalysis, getOrStartInFlight, setCachedAnalysis } from "./aiAnalysisCache";
import type { AiAnalysisOutcome } from "./apiTypes";

// Lets rapid edits settle before spending an API call on each one.
export const AI_ANALYSIS_DEBOUNCE_MS = 800;

export type AiAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; outcome: Extract<AiAnalysisOutcome, { status: "ok" }> }
  | { status: "unavailable"; reason: string };

export interface AiAnalysisControllerOptions {
  /** For tests only. */
  requestAiAnalysis?: typeof defaultRequestAiAnalysis;
  debounceMs?: number;
}

export class AiAnalysisController {
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingAiRequest | null = null;
  private latestKey: string | null = null;
  private readonly requestAiAnalysisImpl: typeof defaultRequestAiAnalysis;
  private readonly debounceMs: number;

  constructor(options: AiAnalysisControllerOptions = {}) {
    this.requestAiAnalysisImpl = options.requestAiAnalysis ?? defaultRequestAiAnalysis;
    this.debounceMs = options.debounceMs ?? AI_ANALYSIS_DEBOUNCE_MS;
  }

  /** Cancels anything pending without forgetting the current request key. Use reset() to tear
   * down entirely. */
  private cancelPending(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.pending?.cancel();
    this.pending = null;
  }

  /** Full teardown. Forgets the latest key too, so a stray promise can't be mistaken as current. */
  reset(): void {
    this.cancelPending();
    this.latestKey = null;
  }

  /** Requests (or reuses a cached) AI analysis for this profile and goal. A new call cancels
   * any pending one for a different combination, and a late stale result gets dropped. */
  request(goal: Goal, profile: LinkedInProfile, localResult: MatchResult, onStateChange: (state: AiAnalysisState) => void): void {
    this.cancelPending();

    const requestBody = buildAnalyzeProfileRequest(goal, profile, localResult);
    const cacheKey = computeAnalysisCacheKey(goal, requestBody);
    this.latestKey = cacheKey;

    const cached = getCachedAnalysis(cacheKey);
    if (cached) {
      onStateChange({ status: "ready", outcome: cached });
      return;
    }

    onStateChange({ status: "loading" });
    this.debounceHandle = setTimeout(() => {
      const promise = getOrStartInFlight(cacheKey, () => {
        const pendingRequest = this.requestAiAnalysisImpl(requestBody);
        this.pending = pendingRequest;
        return pendingRequest.promise;
      });
      promise
        .then((outcome) => {
          if (this.latestKey !== cacheKey) return; // superseded, never shown
          if (outcome.status === "ok") {
            setCachedAnalysis(cacheKey, outcome);
            onStateChange({ status: "ready", outcome });
          } else {
            onStateChange({ status: "unavailable", reason: outcome.reason });
          }
        })
        .catch(() => {
          // requestAiAnalysis should always resolve. This is just a safety net so an
          // unexpected throw doesn't leave the UI stuck on loading.
          if (this.latestKey !== cacheKey) return;
          onStateChange({ status: "unavailable", reason: "unexpected_error" });
        });
    }, this.debounceMs);
  }
}
