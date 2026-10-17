import { useEffect, useState } from "react";
import { hashString } from "../ai/aiAnalysisCache";
import { createPersistentCache, type PersistentCache } from "../ai/persistentCache";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { requestSectionAnalysis, type OptimizeProfileRequestBody, type SectionAnalysisRequestBody } from "./optimizerClient";
import { OPTIMIZER_VERSION } from "./optimizerController";
import type { SectionAnalysisDTO, SectionAnalysisOutcome } from "./optimizerTypes";

export type AnalyzedSection = SectionAnalysisRequestBody["section"];

const SECTION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sectionCache = createPersistentCache<SectionAnalysisDTO>("finder.optimizerSectionCache.v1", SECTION_CACHE_TTL_MS, 20);

export function hydrateSectionCache(): Promise<void> {
  return sectionCache.hydrate();
}

export function whenSectionCacheReady(): Promise<void> {
  return sectionCache.whenReady();
}

export function buildSectionRequest(section: AnalyzedSection, body: OptimizeProfileRequestBody): SectionAnalysisRequestBody {
  return { profile: body.profile, section, present: body.sections.find((p) => p.section === section)?.present ?? false, userContext: body.userContext };
}

export function sectionCacheKey(request: SectionAnalysisRequestBody): string {
  const profileHash = hashString(JSON.stringify([request.profile.evidence, request.present]));
  return `${OPTIMIZER_VERSION}:${request.section}:${request.profile.identity}:${profileHash}:${hashString(request.userContext)}`;
}

type Request = (body: SectionAnalysisRequestBody) => PendingRelayRequest<SectionAnalysisOutcome>;
const inFlight = new Map<string, Promise<SectionAnalysisOutcome>>();

export function cachedSectionAnalysis(request: SectionAnalysisRequestBody, cache: PersistentCache<SectionAnalysisDTO> = sectionCache): SectionAnalysisDTO | undefined {
  return cache.get(sectionCacheKey(request));
}

// One request per profile state: repeat calls share the pending one, and results are cached.
export function loadSectionAnalysis(
  request: SectionAnalysisRequestBody,
  send: Request = requestSectionAnalysis,
  cache: PersistentCache<SectionAnalysisDTO> = sectionCache,
): Promise<SectionAnalysisOutcome> {
  const key = sectionCacheKey(request);
  const cached = cache.get(key);
  if (cached) return Promise.resolve({ status: "ok", analysis: cached });
  const pending = inFlight.get(key);
  if (pending) return pending;
  const promise = send(request)
    .promise.catch((): SectionAnalysisOutcome => ({ status: "unavailable", reason: "unexpected_error" }))
    .then((outcome) => {
      inFlight.delete(key);
      if (outcome.status === "ok") cache.set(key, outcome.analysis);
      return outcome;
    });
  inFlight.set(key, promise);
  return promise;
}

export type SectionAnalysisView = { status: "idle" } | { status: "loading" } | { status: "ready"; analysis: SectionAnalysisDTO } | { status: "unavailable"; reason: string };

export function useSectionAnalysis(request: SectionAnalysisRequestBody | null): { view: SectionAnalysisView; retry: () => void } {
  const key = request ? sectionCacheKey(request) : null;
  const [view, setView] = useState<SectionAnalysisView>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!request) {
      setView({ status: "idle" });
      return;
    }
    let active = true;
    void sectionCache.whenReady().then(() => {
      if (!active) return;
      const cached = cachedSectionAnalysis(request);
      if (cached) {
        setView({ status: "ready", analysis: cached });
        return;
      }
      setView({ status: "loading" });
      void loadSectionAnalysis(request).then((outcome) => {
        if (active) setView(outcome.status === "ok" ? { status: "ready", analysis: outcome.analysis } : outcome);
      });
    });
    return () => {
      active = false;
    };
  }, [key, attempt]);

  return { view, retry: () => setAttempt((n) => n + 1) };
}
