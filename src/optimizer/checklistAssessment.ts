// The AI half of a section's checklist: one request per section covering all of its semantic
// criteria, cached by the evidence that request reads. A section whose evidence hasn't changed is
// never asked about again; any change to it produces a new key, so an old verdict never shows
// against new evidence.
import { useEffect, useState } from "react";
import { hashString } from "../ai/aiAnalysisCache";
import { createPersistentCache, type PersistentCache } from "../ai/persistentCache";
import { sendBackgroundRelayRequest, type PendingRelayRequest } from "../ai/backgroundRelay";
import type { OptimizeProfileRequestBody, OptimizerProfilePayload } from "./optimizerClient";
import { OPTIMIZER_VERSION } from "./optimizerController";
import { SEMANTIC_CONTEXT, semanticCriteria, type SemanticResult, type SemanticState } from "./checklist";
import type { OptimizerSection } from "./sections";

export const LINKWISE_OPTIMIZER_CHECKLIST = "LINKWISE_OPTIMIZER_CHECKLIST";
export const LINKWISE_CANCEL_OPTIMIZER_CHECKLIST = "LINKWISE_CANCEL_OPTIMIZER_CHECKLIST";

export interface ChecklistRequestBody {
  profile: OptimizerProfilePayload;
  section: OptimizerSection;
  criteria: { id: string; label: string; advice: string }[];
  userContext: string;
}

type ChecklistApiResponse = { status: "checklist"; results: SemanticResult[] } | { status: string; reason?: string };
export type ChecklistOutcome = { status: "ok"; results: SemanticResult[] } | { status: "unavailable"; reason: string };

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const checklistCache = createPersistentCache<SemanticResult[]>("finder.optimizerChecklistCache.v1", CACHE_TTL_MS, 60);

export function hydrateChecklistCache(): Promise<void> {
  return checklistCache.hydrate();
}

export function whenChecklistCacheReady(): Promise<void> {
  return checklistCache.whenReady();
}

// How much of a long list the profile page showed, when LinkWise read only part of it.
export function partialList(section: OptimizerSection, body: OptimizeProfileRequestBody): { read: number; total: number } | null {
  const own = body.profile.evidence.filter((item) => item.section === section);
  if (own.length === 0) return null;
  const read = section === "skills" ? own[0]!.text.split(", ").length : own.length;
  const total = body.sections.find((p) => p.section === section)?.itemCount ?? 0;
  return total > read ? { read, total } : null;
}

// Null for sections whose checklist has nothing AI needs to judge, or whose list was only partly read.
export function buildChecklistRequest(section: OptimizerSection, body: OptimizeProfileRequestBody): ChecklistRequestBody | null {
  const criteria = semanticCriteria(section);
  const read = SEMANTIC_CONTEXT[section];
  if (criteria.length === 0 || !read || partialList(section, body)) return null;
  const evidence = body.profile.evidence.filter((item) => read.includes(item.section));
  if (!evidence.some((item) => item.section === section)) return null;
  return {
    profile: { identity: body.profile.identity, evidence },
    section,
    criteria: criteria.map(({ id, label, advice }) => ({ id, label, advice })),
    userContext: body.userContext,
  };
}

export function checklistCacheKey(request: ChecklistRequestBody): string {
  const evidenceHash = hashString(JSON.stringify(request.profile.evidence));
  const criteriaHash = hashString(JSON.stringify(request.criteria));
  return `${OPTIMIZER_VERSION}:checklist:${request.section}:${request.profile.identity}:${evidenceHash}:${criteriaHash}:${hashString(request.userContext)}`;
}

export function requestChecklist(payload: ChecklistRequestBody): PendingRelayRequest<ChecklistOutcome> {
  return sendBackgroundRelayRequest<ChecklistApiResponse, ChecklistOutcome>({
    requestType: LINKWISE_OPTIMIZER_CHECKLIST,
    cancelType: LINKWISE_CANCEL_OPTIMIZER_CHECKLIST,
    idPrefix: "checklist_req",
    payload,
    toOutcome: (response) =>
      response.status === "checklist" && "results" in response
        ? { status: "ok", results: response.results }
        : { status: "unavailable", reason: response.status === "unavailable" && "reason" in response && response.reason ? response.reason : response.status },
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}

type Send = (body: ChecklistRequestBody) => PendingRelayRequest<ChecklistOutcome>;
const inFlight = new Map<string, Promise<ChecklistOutcome>>();

export function cachedChecklist(request: ChecklistRequestBody, cache: PersistentCache<SemanticResult[]> = checklistCache): SemanticResult[] | undefined {
  return cache.get(checklistCacheKey(request));
}

export function loadChecklist(request: ChecklistRequestBody, send: Send = requestChecklist, cache: PersistentCache<SemanticResult[]> = checklistCache): Promise<ChecklistOutcome> {
  const key = checklistCacheKey(request);
  const cached = cache.get(key);
  if (cached) return Promise.resolve({ status: "ok", results: cached });
  const pending = inFlight.get(key);
  if (pending) return pending;
  const promise = send(request)
    .promise.catch((): ChecklistOutcome => ({ status: "unavailable", reason: "unexpected_error" }))
    .then((outcome) => {
      inFlight.delete(key);
      if (outcome.status === "ok") cache.set(key, outcome.results);
      return outcome;
    });
  inFlight.set(key, promise);
  return promise;
}

export function useChecklistAssessment(request: ChecklistRequestBody | null): { state: SemanticState; retry: () => void } {
  const key = request ? checklistCacheKey(request) : null;
  const [state, setState] = useState<SemanticState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!request) {
      setState({ status: "idle" });
      return;
    }
    let active = true;
    void checklistCache.whenReady().then(() => {
      if (!active) return;
      const cached = cachedChecklist(request);
      if (cached) {
        setState({ status: "ready", results: cached });
        return;
      }
      setState({ status: "loading" });
      void loadChecklist(request).then((outcome) => {
        if (active) setState(outcome.status === "ok" ? { status: "ready", results: outcome.results } : { status: "unavailable", reason: outcome.reason });
      });
    });
    return () => {
      active = false;
    };
  }, [key, attempt]);

  return { state, retry: () => setAttempt((n) => n + 1) };
}
