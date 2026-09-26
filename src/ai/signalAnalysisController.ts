import type { LinkedInProfile } from "../models/profile";
import { buildEvidencePayload } from "./evidencePayload";
import { hashString } from "./aiAnalysisCache";
import { requestSignalAnalysis as defaultRequest, type AnalyzeSignalsRequestBody, type PendingSignalRequest } from "./signalsClient";
import type { ProfileSignalDTO, SignalAnalysisOutcome, SignalFactDTO } from "./signalTypes";

export const SIGNAL_ANALYSIS_VERSION = "signals-v1";
export const SIGNAL_DEBOUNCE_MS = 1500;
export const SIGNAL_TIMEOUT_MS = 75000;

export type SignalAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; profileKey: string; signals: ProfileSignalDTO[]; facts: SignalFactDTO[] }
  | { status: "unavailable"; reason: string };

type Ready = Extract<SignalAnalysisState, { status: "ready" }>;

export function buildSignalsRequest(profileKey: string, profile: LinkedInProfile): AnalyzeSignalsRequestBody | null {
  const evidence = buildEvidencePayload(profile).filter((item) => item.section !== "location");
  return evidence.length > 0 ? { profile: { identity: profileKey, evidence } } : null;
}

export function signalsCacheKey(body: AnalyzeSignalsRequestBody): string {
  return `${SIGNAL_ANALYSIS_VERSION}:${body.profile.identity}:${hashString(JSON.stringify(body.profile.evidence))}`;
}

export interface SignalAnalysisControllerOptions {
  onChange: (state: SignalAnalysisState) => void;
  request?: (body: AnalyzeSignalsRequestBody) => PendingSignalRequest;
  debounceMs?: number;
  timeoutMs?: number;
}

interface Job {
  key: string;
  profileKey: string;
  body: AnalyzeSignalsRequestBody;
}

export class SignalAnalysisController {
  private state: SignalAnalysisState = { status: "idle" };
  private currentKey: string | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private pending: (PendingSignalRequest & { key: string }) | null = null;
  private queued: Job | null = null;
  private profileKey: string | null = null;
  private readonly cache = new Map<string, Ready>();
  private readonly request: (body: AnalyzeSignalsRequestBody) => PendingSignalRequest;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;
  private readonly onChange: (state: SignalAnalysisState) => void;

  constructor(options: SignalAnalysisControllerOptions) {
    this.onChange = options.onChange;
    this.request = options.request ?? defaultRequest;
    this.debounceMs = options.debounceMs ?? SIGNAL_DEBOUNCE_MS;
    this.timeoutMs = options.timeoutMs ?? SIGNAL_TIMEOUT_MS;
  }

  getState(): SignalAnalysisState {
    return this.state;
  }

  update(input: { profileKey: string; profile: LinkedInProfile } | null): void {
    const body = input ? buildSignalsRequest(input.profileKey, input.profile) : null;
    if (!input || !body) {
      this.reset();
      return;
    }

    const key = signalsCacheKey(body);
    if (key === this.currentKey) return;
    if (input.profileKey !== this.profileKey) {
      this.cancelPending();
      this.profileKey = input.profileKey;
    }
    this.currentKey = key;

    const cached = this.cache.get(key);
    if (cached) {
      this.queued = null;
      this.setState(cached);
      return;
    }

    const job = { key, profileKey: input.profileKey, body };
    if (this.pending) {
      this.queued = job;
      return;
    }
    if (!this.isShowing(input.profileKey)) this.setState({ status: "loading" });
    this.schedule(job);
  }

  reset(): void {
    this.cancelPending();
    this.currentKey = null;
    this.profileKey = null;
    if (this.state.status !== "idle") this.setState({ status: "idle" });
  }

  private isShowing(profileKey: string): boolean {
    return this.state.status === "ready" && this.state.profileKey === profileKey;
  }

  private schedule(job: Job): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.send(job), this.debounceMs);
  }

  private send(job: Job): void {
    this.debounceHandle = null;
    const pending = this.request(job.body);
    this.pending = { ...pending, key: job.key };
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SignalAnalysisOutcome>((resolve) => {
      timeoutHandle = setTimeout(() => {
        pending.cancel();
        resolve({ status: "unavailable", reason: "timeout" });
      }, this.timeoutMs);
    });

    Promise.race([pending.promise, timeout])
      .catch((): SignalAnalysisOutcome => ({ status: "unavailable", reason: "unexpected_error" }))
      .then((outcome) => {
        clearTimeout(timeoutHandle);
        if (this.pending?.key !== job.key || this.profileKey !== job.profileKey) return;
        this.pending = null;
        const current = job.key === this.currentKey || !this.isShowing(job.profileKey);
        if (outcome.status === "ok") {
          const ready: Ready = { status: "ready", profileKey: job.profileKey, signals: outcome.signals, facts: outcome.facts };
          this.cache.set(job.key, ready);
          if (current) this.setState(ready);
        } else if (current) {
          this.setState({ status: "unavailable", reason: outcome.reason });
        }
        const next = this.queued;
        this.queued = null;
        if (next && next.key === this.currentKey && !this.cache.has(next.key)) this.schedule(next);
      });
  }

  private cancelPending(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.pending?.cancel();
    this.pending = null;
    this.queued = null;
  }

  private setState(next: SignalAnalysisState): void {
    this.state = next;
    this.onChange(next);
  }
}
