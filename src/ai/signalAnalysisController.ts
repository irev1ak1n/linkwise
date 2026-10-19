import type { LinkedInProfile } from "../models/profile";
import { buildEvidencePayload, type EvidencePayloadItem } from "./evidencePayload";
import { hashString } from "./aiAnalysisCache";
import { requestSignalAnalysis as defaultRequest, type AnalyzeSignalsRequestBody, type PendingSignalRequest } from "./signalsClient";
import type { CareerStage, GradedCandidateDTO, InlineHighlightDTO, SignalClassificationOutcome, SignalFactDTO } from "./signalTypes";
import { PROFILE_SESSION_RETENTION_MS } from "../storage/profileSessionRepository";
import { createPersistentCache, type PersistentCache } from "./persistentCache";
import { SIGNAL_RANKING_VERSION, rankSignals, type RankCandidate, type RankingResult } from "../signals/signalRanking";
import { heuristicGrades } from "../signals/heuristicGrades";
import { phraseCategory } from "../signals/highlightCategories";
import { planHighlights, sentenceIndex } from "../signals/signalPlan";

export const SIGNAL_ANALYSIS_VERSION = `signals-v${SIGNAL_RANKING_VERSION}`;
export const SIGNAL_DEBOUNCE_MS = 1500;
export const SIGNAL_TIMEOUT_MS = 75000;
// Small batches keep each grading call well inside the backend's time limit on dense profiles.
const MAX_ITEMS_PER_REQUEST = 16;
const MAX_CONTEXT_ITEMS = 120;
const CONTEXT_TEXT = 160;
export const SIGNAL_DEBUG_FLAG = "linkwise:debugSignals";

export type SignalAnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      profileKey: string;
      highlights: InlineHighlightDTO[];
      facts: SignalFactDTO[];
      /** "heuristic" when grading came from the local fallback instead of the AI classifier. */
      source: "ai" | "mixed" | "heuristic";
      ranking: RankingResult;
      updating?: boolean;
      updateError?: string;
    }
  | { status: "unavailable"; reason: string };


// Grades for one evidence item, keyed by its content: an unchanged item is never graded twice,
// and an edited or removed one simply stops matching.
export interface StoredGrades {
  careerStage: CareerStage;
  candidates: Omit<GradedCandidateDTO, "evidenceId" | "section">[];
}

const gradeCache = createPersistentCache<StoredGrades>("finder.signalGrades.v2", PROFILE_SESSION_RETENTION_MS, 800);

export function hydrateSignalCache(): Promise<void> {
  return gradeCache.hydrate();
}

export function clearSignalCache(): void {
  gradeCache.clear();
}

export interface SignalInput {
  profileKey: string;
  profile: LinkedInProfile;
  /** The active goal as text, or null when there is none; Signal Mode works either way. */
  goalText?: string | null;
}

function gradableItems(profile: LinkedInProfile): EvidencePayloadItem[] {
  return buildEvidencePayload(profile).filter((item) => item.section !== "location" && item.section !== "headline");
}

export function buildSignalsRequest(profileKey: string, profile: LinkedInProfile, goalText: string | null = null): AnalyzeSignalsRequestBody | null {
  const evidence = gradableItems(profile);
  return evidence.length > 0 ? { version: 3, profile: { identity: profileKey, evidence }, goal: goalText ? { text: goalText } : null } : null;
}

const itemHash = (item: EvidencePayloadItem) => hashString(`${item.section}\n${item.text}`);
export const goalHash = (goalText: string | null | undefined) => (goalText ? hashString(goalText) : "none");

// The plan for a whole profile: identity, evidence, goal, and ranking version.
export function signalsCacheKey(body: AnalyzeSignalsRequestBody): string {
  return `${SIGNAL_ANALYSIS_VERSION}:${body.profile.identity}:${hashString(JSON.stringify(body.profile.evidence))}:${goalHash(body.goal?.text)}`;
}

const gradeKey = (identity: string, goal: string, item: EvidencePayloadItem) => `${SIGNAL_RANKING_VERSION}:${identity}:${goal}:${itemHash(item)}`;

export interface SignalAnalysisControllerOptions {
  onChange: (state: SignalAnalysisState) => void;
  request?: (body: AnalyzeSignalsRequestBody) => PendingSignalRequest;
  debounceMs?: number;
  timeoutMs?: number;
  cache?: PersistentCache<StoredGrades>;
  /** Discovery rotation for a newly opened profile; fixed for the rest of that visit. */
  seed?: () => number;
  debug?: (ranking: RankingResult, profileKey: string) => void;
}

interface Pending {
  keys: Set<string>;
  cancel: () => void;
}

function debugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SIGNAL_DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

function logRanking(ranking: RankingResult, profileKey: string): void {
  if (!debugEnabled()) return;
  const rows = ranking.debug.map((r) => ({ status: r.status, reason: r.reason ?? "", band: r.band, score: r.score, intrinsic: r.intrinsic, goal: r.goalPart, type: r.type, section: r.section, quote: r.quote, sentence: r.sentence, claim: r.claim, group: r.group, labels: r.labels.join(" "), category: phraseCategory(r), confidence: r.confidence, grades: Object.entries(r.grades).filter(([, v]) => v > 0).map(([k, v]) => `${k}${v}`).join(" "), goalRelevance: r.goalRelevance }));
  console.groupCollapsed(`[LinkWise signals] ${profileKey}: ${ranking.core.length} core, ${ranking.discovery.length} discovery, ${ranking.debug.length} candidates`);
  console.table(rows);
  console.groupEnd();
  // Also readable from the page's own console tools, which cannot see a content script's logs.
  if (typeof window !== "undefined") window.postMessage({ type: "__linkwise_signals_debug__", profileKey, rows }, window.location.origin);
}

// Grades evidence items in batches, caches the grades per item, and re-ranks the whole profile
// locally whenever its evidence or goal changes. Only items never graded before are sent.
export class SignalAnalysisController {
  private state: SignalAnalysisState = { status: "idle" };
  private profileKey: string | null = null;
  private latest: SignalInput | null = null;
  private signature: string | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private pending: Pending | null = null;
  private deferred = false;
  private lastError: string | undefined;
  private readonly failed = new Set<string>();
  // The last grades each item slot had, used for an edited item until its new grades arrive.
  private readonly previous = new Map<string, StoredGrades>();
  private readonly incumbents = new Map<string, Set<string>>();
  private readonly seeds = new Map<string, number>();
  private readonly cache: PersistentCache<StoredGrades>;
  private readonly request: (body: AnalyzeSignalsRequestBody) => PendingSignalRequest;
  private readonly debounceMs: number;
  private readonly timeoutMs: number;
  private readonly onChange: (state: SignalAnalysisState) => void;
  private readonly seed: () => number;
  private readonly debug: (ranking: RankingResult, profileKey: string) => void;

  constructor(options: SignalAnalysisControllerOptions) {
    this.onChange = options.onChange;
    this.request = options.request ?? defaultRequest;
    this.debounceMs = options.debounceMs ?? SIGNAL_DEBOUNCE_MS;
    this.timeoutMs = options.timeoutMs ?? SIGNAL_TIMEOUT_MS;
    this.cache = options.cache ?? gradeCache;
    this.seed = options.seed ?? (() => Math.floor(Math.random() * 1_000_000));
    this.debug = options.debug ?? logRanking;
  }

  getState(): SignalAnalysisState {
    return this.state;
  }

  update(input: SignalInput | null): void {
    if (!input || gradableItems(input.profile).length === 0) {
      this.reset();
      return;
    }
    this.latest = input;
    if (!this.cache.isReady()) {
      if (!this.deferred) {
        this.deferred = true;
        void this.cache.whenReady().then(() => {
          this.deferred = false;
          this.update(this.latest);
        });
      }
      return;
    }

    if (input.profileKey !== this.profileKey) {
      this.cancelPending();
      this.profileKey = input.profileKey;
      this.signature = null;
      this.lastError = undefined;
      if (!this.seeds.has(input.profileKey)) this.seeds.set(input.profileKey, this.seed());
    }
    const items = gradableItems(input.profile);
    const goal = goalHash(input.goalText);
    const signature = `${goal}:${items.map(itemHash).join(",")}`;
    if (signature === this.signature) return;
    this.signature = signature;

    const keys = items.map((item) => gradeKey(input.profileKey, goal, item));
    const missing = items.filter((_, i) => !this.cache.get(keys[i]!) && !this.failed.has(keys[i]!) && !this.pending?.keys.has(keys[i]!));
    this.assemble(input, items, keys, missing.length > 0 || !!this.pending);
    if (missing.length > 0 && !this.pending) this.schedule();
  }

  reset(): void {
    this.cancelPending();
    this.latest = null;
    this.signature = null;
    this.profileKey = null;
    this.lastError = undefined;
    if (this.state.status !== "idle") this.setState({ status: "idle" });
  }

  private assemble(input: SignalInput, items: EvidencePayloadItem[], keys: string[], updating: boolean): void {
    const goal = goalHash(input.goalText);
    const candidates: RankCandidate[] = [];
    let graded = 0;
    let fallback = 0;
    items.forEach((item, order) => {
      const key = keys[order]!;
      const slot = `${input.profileKey}:${goal}:${item.id}`;
      const stored = this.cache.get(key);
      if (stored) this.previous.set(slot, stored);
      // An edited item keeps its earlier grades while regrading, but only for phrases still present.
      const provisional = !stored && !this.failed.has(key) ? this.previous.get(slot) : undefined;
      const grades = stored?.candidates ?? provisional?.candidates ?? (this.failed.has(key) ? heuristicGrades(item) : null);
      if (!grades) return;
      if (stored || provisional) graded++;
      else fallback++;
      const hash = itemHash(item);
      for (const c of grades) {
        // Grounding against the current text: a quote that is no longer there is never ranked.
        const position = item.text.indexOf(c.quote);
        if (position === -1) continue;
        candidates.push({ ...c, id: `${hash}|${c.quote.toLowerCase()}`, itemKey: hash, evidenceId: item.id, section: item.section, itemOrder: order, position, itemLength: item.text.length, sentence: sentenceIndex(item.text, position) });
      }
    });

    if (graded + fallback === 0) {
      if (updating) this.setState({ status: "loading" });
      return;
    }
    const sessionKey = `${input.profileKey}:${goal}`;
    const ranking = rankSignals(candidates, { goalActive: goal !== "none", incumbents: this.incumbents.get(sessionKey), discoverySeed: this.seeds.get(input.profileKey) });
    this.incumbents.set(sessionKey, new Set(ranking.core.map((c) => c.id)));
    const highlights: InlineHighlightDTO[] = planHighlights(ranking, new Map(items.map((item) => [item.id, item.text])));
    const source = fallback === 0 ? "ai" : graded === 0 ? "heuristic" : "mixed";
    this.debug(ranking, input.profileKey);
    this.setState({ status: "ready", profileKey: input.profileKey, highlights, facts: ranking.facts, source, ranking, updating, updateError: updating ? undefined : this.lastError });
  }

  private schedule(): void {
    if (this.debounceHandle) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.send(), this.debounceMs);
  }

  private send(): void {
    this.debounceHandle = null;
    const input = this.latest;
    if (!input || input.profileKey !== this.profileKey) return;
    const goal = goalHash(input.goalText);
    const items = gradableItems(input.profile);
    const keys = items.map((item) => gradeKey(input.profileKey, goal, item));
    const batch = items.map((item, i) => ({ item, key: keys[i]! })).filter(({ key }) => !this.cache.get(key) && !this.failed.has(key)).slice(0, MAX_ITEMS_PER_REQUEST);
    if (batch.length === 0) return;
    const inBatch = new Set(batch.map(({ item }) => item.id));
    const context = items
      .filter((item) => !inBatch.has(item.id))
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((item) => ({ section: item.section, text: item.text.slice(0, CONTEXT_TEXT) }));
    const body: AnalyzeSignalsRequestBody = {
      version: 3,
      profile: { identity: input.profileKey, evidence: batch.map(({ item }) => item), context },
      goal: input.goalText ? { text: input.goalText } : null,
    };

    const request = this.request(body);
    const pending: Pending = { keys: new Set(batch.map(({ key }) => key)), cancel: request.cancel };
    this.pending = pending;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SignalClassificationOutcome>((resolve) => {
      timeoutHandle = setTimeout(() => {
        request.cancel();
        resolve({ status: "unavailable", reason: "timeout" });
      }, this.timeoutMs);
    });

    Promise.race([request.promise, timeout])
      .catch((): SignalClassificationOutcome => ({ status: "unavailable", reason: "unexpected_error" }))
      .then((outcome) => {
        clearTimeout(timeoutHandle);
        if (this.pending !== pending) return;
        this.pending = null;
        if (outcome.status === "ok") {
          const byId = new Map(batch.map(({ item, key }) => [item.id, key]));
          const grouped = new Map<string, StoredGrades>();
          for (const id of outcome.classified) {
            const key = byId.get(id);
            if (key) grouped.set(key, { careerStage: outcome.careerStage, candidates: [] });
          }
          for (const { evidenceId: id, section: _section, ...candidate } of outcome.candidates) {
            const key = byId.get(id);
            if (key) grouped.get(key)?.candidates.push(candidate);
          }
          this.cache.setMany([...grouped.entries()]);
          this.lastError = undefined;
        } else {
          // Ungraded items fall back to local heuristics for this visit; highlights never go away.
          for (const key of pending.keys) this.failed.add(key);
          this.lastError = outcome.reason;
        }
        this.signature = null;
        this.update(this.latest);
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
