// The debounce/cache/cancellation logic behind AI analysis. A plain class, not a hook,
// so it can be tested with fake timers without any React rendering.
import type { Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { MatchResult } from "../matching/scoreProfile";
import { buildAnalyzeProfileRequest, type AnalyzeProfileRequestBody, type PreviousAnalysis } from "./buildAnalyzeRequest";
import { requestAiAnalysis as defaultRequestAiAnalysis, type PendingAiRequest } from "./analyzeProfileClient";
import { analysisSubjectKey, computeAnalysisCacheKey } from "./analysisCacheKey";
import { forgetInFlight, getCachedAnalysis, getLatestAnalysis, getOrStartInFlight, hashString, isAnalysisCacheReady, setCachedAnalysis, setLatestAnalysis, whenAnalysisCacheReady, type LatestAnalysis } from "./aiAnalysisCache";
import type { AiAnalysisOutcome } from "./apiTypes";

// Lets rapid edits settle before spending an API call on each one.
export const AI_ANALYSIS_DEBOUNCE_MS = 800;
export const AI_ANALYSIS_TIMEOUT_MS = 60000;

export type AiAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; outcome: Extract<AiAnalysisOutcome, { status: "ok" }>; updating?: boolean; updateError?: string }
  | { status: "unavailable"; reason: string };

export interface AiAnalysisControllerOptions {
  /** For tests only. */
  requestAiAnalysis?: typeof defaultRequestAiAnalysis;
  debounceMs?: number;
  timeoutMs?: number;
}

interface Job {
  key: string;
  body: AnalyzeProfileRequestBody;
  /** The person and goal this analysis belongs to, when known. */
  person: string | null;
}

const evidenceHashes = (body: AnalyzeProfileRequestBody) => body.profile.evidence.map((item) => hashString(item.text));

// The earlier result for the same person and goal, as the next request's starting point: what it
// concluded per criterion, and which evidence is new since then.
function previousAnalysis(latest: LatestAnalysis | undefined, key: string, body: AnalyzeProfileRequestBody): PreviousAnalysis | undefined {
  if (!latest || latest.key === key) return undefined;
  const outcome = getCachedAnalysis(latest.key);
  if (!outcome || outcome.result.scorePercent === null) return undefined;
  const seen = new Set(latest.evidence);
  return {
    matchPercent: outcome.result.scorePercent,
    assessments: [
      ...outcome.result.reasons.map((r) => ({ criterionId: r.criterion.id, strength: r.strength, evidenceSection: r.evidence.sourceSection, evidenceText: r.evidence.snippet })),
      ...outcome.result.missing.map((m) => ({ criterionId: m.criterion.id, strength: m.strength })),
    ],
    newEvidenceIds: body.profile.evidence.filter((item) => !seen.has(hashString(item.text))).map((item) => item.id),
  };
}

export class AiAnalysisController {
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private pending: (PendingAiRequest & { key: string }) | null = null;
  private queued: Job | null = null;
  private latestKey: string | null = null;
  private subject: string | null = null;
  private showingResult = false;
  private current: Extract<AiAnalysisOutcome, { status: "ok" }> | null = null;
  private deferred: Parameters<AiAnalysisController["request"]> | null = null;
  private onStateChange: (state: AiAnalysisState) => void = () => {};
  private readonly requestAiAnalysisImpl: typeof defaultRequestAiAnalysis;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;

  constructor(options: AiAnalysisControllerOptions = {}) {
    this.requestAiAnalysisImpl = options.requestAiAnalysis ?? defaultRequestAiAnalysis;
    this.debounceMs = options.debounceMs ?? AI_ANALYSIS_DEBOUNCE_MS;
    this.timeoutMs = options.timeoutMs ?? AI_ANALYSIS_TIMEOUT_MS;
  }

  private cancelPending(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    if (this.pending) {
      this.pending.cancel();
      forgetInFlight(this.pending.key);
    }
    this.pending = null;
    this.queued = null;
  }

  /** Full teardown. Forgets the latest key too, so a stray promise can't be mistaken as current. */
  reset(): void {
    this.deferred = null;
    this.cancelPending();
    this.latestKey = null;
    this.subject = null;
    this.showingResult = false;
    this.current = null;
  }

  /** Requests (or reuses a cached) AI analysis. New evidence for the same profile and goal never
   * cancels an in-flight request; it queues one refresh instead. */
  request(goal: Goal, profile: LinkedInProfile, localResult: MatchResult, onStateChange: (state: AiAnalysisState) => void, personKey: string | null = null): void {
    this.onStateChange = onStateChange;
    if (!isAnalysisCacheReady()) {
      if (!this.deferred) {
        void whenAnalysisCacheReady().then(() => {
          const args = this.deferred;
          this.deferred = null;
          if (args) this.request(...args);
        });
      }
      this.deferred = [goal, profile, localResult, onStateChange, personKey];
      if (!this.showingResult) this.show({ status: "loading" });
      return;
    }
    const body = buildAnalyzeProfileRequest(goal, profile, localResult);
    const key = computeAnalysisCacheKey(goal, body);
    if (key === this.latestKey) return;

    const subject = analysisSubjectKey(goal, body);
    const person = personKey ? `${personKey}|${analysisSubjectKey(goal, { ...body, profile: { ...body.profile, identity: "" } })}` : null;
    if (subject !== this.subject) {
      this.cancelPending();
      this.showingResult = false;
      this.subject = subject;
    }
    this.latestKey = key;

    const cached = getCachedAnalysis(key);
    if (cached) {
      this.queued = null;
      if (person) setLatestAnalysis(person, { key, evidence: evidenceHashes(body) });
      this.show({ status: "ready", outcome: cached });
      return;
    }

    const previous = person ? previousAnalysis(getLatestAnalysis(person), key, body) : undefined;
    const job: Job = { key, body: previous ? { ...body, previous } : body, person };
    if (this.pending) {
      this.queued = job;
      this.markUpdating();
      return;
    }
    if (this.showingResult) this.markUpdating();
    else this.show({ status: "loading" });
    this.schedule(job);
  }

  /** Forgets the current result and asks again, e.g. after a timeout. */
  retry(goal: Goal, profile: LinkedInProfile, localResult: MatchResult, onStateChange: (state: AiAnalysisState) => void, personKey: string | null = null): void {
    this.reset();
    this.request(goal, profile, localResult, onStateChange, personKey);
  }

  private schedule(job: Job): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.send(job), this.debounceMs);
  }

  private send(job: Job): void {
    this.debounceHandle = null;
    const subject = this.subject;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const promise = getOrStartInFlight(job.key, () => {
      const pendingRequest = this.requestAiAnalysisImpl(job.body);
      this.pending = { ...pendingRequest, key: job.key };
      const timeout = new Promise<AiAnalysisOutcome>((resolve) => {
        timeoutHandle = setTimeout(() => {
          pendingRequest.cancel();
          resolve({ status: "unavailable", reason: "timeout" });
        }, this.timeoutMs);
      });
      return Promise.race([pendingRequest.promise, timeout]);
    });
    this.pending ??= { requestId: job.key, promise, cancel: () => {}, key: job.key };

    promise
      .catch((): AiAnalysisOutcome => ({ status: "unavailable", reason: "unexpected_error" }))
      .then((outcome) => {
        clearTimeout(timeoutHandle);
        if (this.subject !== subject || this.pending?.key !== job.key) return;
        this.pending = null;
        const refreshing = this.queued !== null && this.queued.key === this.latestKey;
        if (outcome.status === "ok") {
          setCachedAnalysis(job.key, outcome);
          if (job.person) setLatestAnalysis(job.person, { key: job.key, evidence: evidenceHashes(job.body) });
          if (job.key === this.latestKey || !this.showingResult) this.show({ status: "ready", outcome, updating: refreshing });
        } else if (this.showingResult && this.current) {
          this.show({ status: "ready", outcome: this.current, updating: refreshing, updateError: refreshing ? undefined : outcome.reason });
        } else if (job.key === this.latestKey) {
          this.show({ status: "unavailable", reason: outcome.reason });
        }
        const next = this.queued;
        this.queued = null;
        if (next && next.key === this.latestKey && !getCachedAnalysis(next.key)) this.schedule(next);
      });
  }

  private markUpdating(): void {
    if (this.showingResult && this.current) this.show({ status: "ready", outcome: this.current, updating: true });
  }

  private show(state: AiAnalysisState): void {
    this.showingResult = state.status === "ready";
    this.current = state.status === "ready" ? state.outcome : null;
    this.onStateChange(state);
  }
}
