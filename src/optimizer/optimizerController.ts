import type { LinkedInProfile } from "../models/profile";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { buildEvidencePayload } from "../ai/evidencePayload";
import { hashString } from "../ai/aiAnalysisCache";
import { createPersistentCache, type PersistentCache } from "../ai/persistentCache";
import { requestProfileOptimization, type OptimizeProfileRequestBody } from "./optimizerClient";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { buildSectionMap } from "./sections";
import { computeOptimizerScore } from "./score";
import type { OptimizerOutcome, OptimizerResultDTO } from "./optimizerTypes";

export const OPTIMIZER_VERSION = "optimizer-v8";
const OPTIMIZER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OPTIMIZER_DEBOUNCE_MS = 2000;
const OPTIMIZER_TIMEOUT_MS = 130000;

export interface OptimizerInput {
  profileKey: string;
  profile: LinkedInProfile;
  shell: ProfileShell;
  userContext: string;
}

export interface OptimizerReady {
  status: "ready";
  key: string;
  profileKey: string;
  body: OptimizeProfileRequestBody;
  result: OptimizerResultDTO;
  score: number;
  updating?: boolean;
  updateError?: string;
}

export type OptimizerViewState = { status: "idle" } | { status: "loading" } | OptimizerReady | { status: "unavailable"; reason: string };

interface CachedResult {
  result: OptimizerResultDTO;
}

const optimizerCache = createPersistentCache<CachedResult>("finder.optimizerCache.v1", OPTIMIZER_CACHE_TTL_MS, 10);

export function hydrateOptimizerCache(): Promise<void> {
  return optimizerCache.hydrate();
}

export function buildOptimizerRequest(input: OptimizerInput): OptimizeProfileRequestBody {
  const evidence = buildEvidencePayload(input.profile);
  return { profile: { identity: input.profileKey, evidence }, sections: buildSectionMap(input.profile, input.shell, evidence), userContext: input.userContext.trim() };
}

export function optimizerCacheKey(body: OptimizeProfileRequestBody): string {
  const profileHash = hashString(JSON.stringify([body.profile.evidence, body.sections]));
  return `${OPTIMIZER_VERSION}:${body.profile.identity}:${profileHash}:${hashString(body.userContext)}`;
}

export interface OptimizerControllerOptions {
  onChange: (state: OptimizerViewState) => void;
  request?: (body: OptimizeProfileRequestBody) => PendingRelayRequest<OptimizerOutcome>;
  cache?: PersistentCache<CachedResult>;
  debounceMs?: number;
  timeoutMs?: number;
}

interface Job {
  key: string;
  profileKey: string;
  body: OptimizeProfileRequestBody;
}

function readyState(job: Job, result: OptimizerResultDTO): OptimizerReady {
  return { status: "ready", key: job.key, profileKey: job.profileKey, body: job.body, result, score: computeOptimizerScore(job.body.sections, result.sections) };
}

export class OptimizerController {
  private state: OptimizerViewState = { status: "idle" };
  private current: Job | null = null;
  private pending: (PendingRelayRequest<OptimizerOutcome> & { key: string }) | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private deferred: OptimizerInput | null = null;
  private readonly onChange: (state: OptimizerViewState) => void;
  private readonly request: (body: OptimizeProfileRequestBody) => PendingRelayRequest<OptimizerOutcome>;
  private readonly cache: PersistentCache<CachedResult>;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;

  constructor(options: OptimizerControllerOptions) {
    this.onChange = options.onChange;
    this.request = options.request ?? requestProfileOptimization;
    this.cache = options.cache ?? optimizerCache;
    this.debounceMs = options.debounceMs ?? OPTIMIZER_DEBOUNCE_MS;
    this.timeoutMs = options.timeoutMs ?? OPTIMIZER_TIMEOUT_MS;
  }

  getState(): OptimizerViewState {
    return this.state;
  }

  update(input: OptimizerInput | null): void {
    if (!input) {
      this.reset();
      return;
    }
    if (!this.cache.isReady()) {
      if (!this.deferred) void this.cache.whenReady().then(() => this.deferred && this.update(this.deferred));
      this.deferred = input;
      return;
    }
    this.deferred = null;

    const body = buildOptimizerRequest(input);
    const job = { key: optimizerCacheKey(body), profileKey: input.profileKey, body };
    if (job.key === this.current?.key) return;
    if (this.current && this.current.profileKey !== job.profileKey) {
      this.cancelPending();
      if (this.state.status !== "idle") this.setState({ status: "idle" });
    }
    this.current = job;

    const cached = this.cache.get(job.key);
    if (cached) {
      this.setState(readyState(job, cached.result));
      return;
    }
    if (this.showing(job.profileKey)) this.setState({ ...(this.state as OptimizerReady), updating: true, updateError: undefined });
    else this.setState({ status: "loading" });
    if (!this.pending) this.schedule();
  }

  retry(): void {
    if (!this.current || this.pending) return;
    if (this.showing(this.current.profileKey)) this.setState({ ...(this.state as OptimizerReady), updating: true, updateError: undefined });
    else this.setState({ status: "loading" });
    this.send();
  }

  reset(): void {
    this.deferred = null;
    this.cancelPending();
    this.current = null;
    if (this.state.status !== "idle") this.setState({ status: "idle" });
  }

  private showing(profileKey: string): boolean {
    return this.state.status === "ready" && this.state.profileKey === profileKey;
  }

  private schedule(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.send(), this.debounceMs);
  }

  private send(): void {
    this.debounceHandle = null;
    const job = this.current;
    if (!job) return;
    const pending = this.request(job.body);
    this.pending = { ...pending, key: job.key };
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<OptimizerOutcome>((resolve) => {
      timeoutHandle = setTimeout(() => {
        pending.cancel();
        resolve({ status: "unavailable", reason: "timeout" });
      }, this.timeoutMs);
    });

    void Promise.race([pending.promise, timeout])
      .catch((): OptimizerOutcome => ({ status: "unavailable", reason: "unexpected_error" }))
      .then((outcome) => {
        clearTimeout(timeoutHandle);
        if (this.pending?.key !== job.key) return;
        this.pending = null;
        const stale = this.current?.key !== job.key;
        if (outcome.status === "ok") {
          this.cache.set(job.key, { result: outcome.result });
          const next = this.current;
          if (!stale) this.setState(readyState(job, outcome.result));
          else if (next?.profileKey === job.profileKey && !this.cache.get(next.key)) this.setState({ ...readyState(job, outcome.result), updating: true });
        } else if (!stale) {
          if (this.showing(job.profileKey)) this.setState({ ...(this.state as OptimizerReady), updating: false, updateError: outcome.reason });
          else this.setState({ status: "unavailable", reason: outcome.reason });
        }
        if (stale && this.current && !this.cache.get(this.current.key)) this.schedule();
      });
  }

  private cancelPending(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.pending?.cancel();
    this.pending = null;
  }

  private setState(next: OptimizerViewState): void {
    this.state = next;
    this.onChange(next);
  }
}
