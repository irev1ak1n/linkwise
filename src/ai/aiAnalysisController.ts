// The debounce/cache/cancellation state machine behind the "analyze this profile with AI"
// flow — deliberately a plain, framework-free class rather than living inside a React hook
// directly, so it can be unit-tested with fake timers without any React rendering machinery
// (matching this project's established pattern of keeping stateful logic in plain modules and
// hooks as thin wrappers — see goalStore.ts / useGoalStore.ts).
import type { Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { MatchResult } from "../matching/scoreProfile";
import { buildAnalyzeProfileRequest } from "./buildAnalyzeRequest";
import { requestAiAnalysis as defaultRequestAiAnalysis, type PendingAiRequest } from "./analyzeProfileClient";
import { computeAnalysisCacheKey } from "./analysisCacheKey";
import { getCachedAnalysis, getOrStartInFlight, setCachedAnalysis } from "./aiAnalysisCache";
import type { AiAnalysisOutcome } from "./apiTypes";

/** Rapid successive criteria edits (or profile evidence updates while still scanning) should
 * settle before spending an API call on each one — see the mission's own "debounce rapid
 * criteria changes so we don't create unnecessary API calls." */
export const AI_ANALYSIS_DEBOUNCE_MS = 800;

export type AiAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; outcome: Extract<AiAnalysisOutcome, { status: "ok" }> }
  | { status: "unavailable"; reason: string };

export interface AiAnalysisControllerOptions {
  /** Injectable for tests — the real caller never needs to pass this. */
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

  /** Cancels whatever is currently pending (debounce timer and/or in-flight request) without
   * forgetting what the "current" request key is — used when a NEW request supersedes an old
   * one. Use `reset()` instead when tearing down entirely (disabled / unmounting). */
  private cancelPending(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.pending?.cancel();
    this.pending = null;
  }

  /** Full teardown — also forgets the latest request key, so a stray in-flight promise from
   * before teardown can never be mistaken for still being "the current one" if it somehow
   * resolves later. */
  reset(): void {
    this.cancelPending();
    this.latestKey = null;
  }

  /**
   * Requests (or reuses a cached/in-flight) AI analysis for this exact profile+goal
   * combination, reporting state transitions through `onStateChange`. Any previously pending
   * request for a DIFFERENT combination is cancelled first — "if the user navigates to a
   * different profile [or changes the goal] while an AI request is running, cancel or ignore
   * the old result" falls out of this by construction: a superseding call always wins, and a
   * stale promise that resolves late is dropped via the `latestKey` check below rather than
   * ever reaching `onStateChange`.
   */
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
          if (this.latestKey !== cacheKey) return; // superseded by a newer request — never shown
          if (outcome.status === "ok") {
            setCachedAnalysis(cacheKey, outcome);
            onStateChange({ status: "ready", outcome });
          } else {
            onStateChange({ status: "unavailable", reason: outcome.reason });
          }
        })
        .catch(() => {
          // requestAiAnalysis is designed to always resolve, never reject — this only guards
          // against a future/unexpected throw so a surprise here degrades to the same graceful
          // fallback as every other failure mode instead of leaving the UI stuck on "loading"
          // forever with no path back to local analysis.
          if (this.latestKey !== cacheKey) return;
          onStateChange({ status: "unavailable", reason: "unexpected_error" });
        });
    }, this.debounceMs);
  }
}
