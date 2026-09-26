import type { LinkedInProfile } from "../models/profile";
import { buildEvidencePayload } from "./evidencePayload";
import { hashString } from "./aiAnalysisCache";
import { requestSignalAnalysis as defaultRequest, type AnalyzeSignalsRequestBody, type PendingSignalRequest } from "./signalsClient";
import type { ProfileSignalDTO, SignalFactDTO } from "./signalTypes";

export const SIGNAL_ANALYSIS_VERSION = "signals-v1";
export const SIGNAL_DEBOUNCE_MS = 1500;

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
}

export class SignalAnalysisController {
  private state: SignalAnalysisState = { status: "idle" };
  private currentKey: string | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingSignalRequest | null = null;
  private readonly cache = new Map<string, Ready>();
  private readonly request: (body: AnalyzeSignalsRequestBody) => PendingSignalRequest;
  private readonly debounceMs: number;
  private readonly onChange: (state: SignalAnalysisState) => void;

  constructor(options: SignalAnalysisControllerOptions) {
    this.onChange = options.onChange;
    this.request = options.request ?? defaultRequest;
    this.debounceMs = options.debounceMs ?? SIGNAL_DEBOUNCE_MS;
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
    this.cancelPending();
    this.currentKey = key;

    const cached = this.cache.get(key);
    if (cached) {
      this.setState(cached);
      return;
    }

    const keepShowing = this.state.status === "ready" && this.state.profileKey === input.profileKey;
    if (!keepShowing) this.setState({ status: "loading" });
    this.debounceHandle = setTimeout(() => this.send(key, input.profileKey, body), this.debounceMs);
  }

  reset(): void {
    this.cancelPending();
    this.currentKey = null;
    if (this.state.status !== "idle") this.setState({ status: "idle" });
  }

  private send(key: string, profileKey: string, body: AnalyzeSignalsRequestBody): void {
    this.debounceHandle = null;
    const pending = this.request(body);
    this.pending = pending;
    pending.promise
      .then((outcome) => {
        if (this.currentKey !== key) return;
        this.pending = null;
        if (outcome.status === "ok") {
          const ready: Ready = { status: "ready", profileKey, signals: outcome.signals, facts: outcome.facts };
          this.cache.set(key, ready);
          this.setState(ready);
        } else {
          this.setState({ status: "unavailable", reason: outcome.reason });
        }
      })
      .catch(() => {
        if (this.currentKey === key) this.setState({ status: "unavailable", reason: "unexpected_error" });
      });
  }

  private cancelPending(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.pending?.cancel();
    this.pending = null;
  }

  private setState(next: SignalAnalysisState): void {
    this.state = next;
    this.onChange(next);
  }
}
