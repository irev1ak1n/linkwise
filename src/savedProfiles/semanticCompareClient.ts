// Layer 2: asks the backend whether ambiguous wording edits changed any facts. Each exact pair of
// texts is asked about once; the answer is cached, so revisits never repeat the request.
import { sendBackgroundRelayRequest } from "../ai/backgroundRelay";
import { hashString } from "../ai/aiAnalysisCache";
import { createPersistentCache } from "../ai/persistentCache";
import type { TextPair } from "./profileDiff";
import type { SemanticResults } from "./savedProfileCheck";
import type { ChangeDirection, ProfileChange } from "./types";

export const LINKWISE_COMPARE_PROFILE = "LINKWISE_COMPARE_PROFILE";
export const LINKWISE_CANCEL_COMPARE_PROFILE = "LINKWISE_CANCEL_COMPARE_PROFILE";

const MAX_ITEMS = 20;

type Verdict =
  | { meaningful: false }
  | { meaningful: true; significance: "meaningful" | "major"; direction: ChangeDirection; title: string; explanation: string; previousValue: string; currentValue: string };
type ComparisonResult = Verdict & { id: string };

type CompareResponse = { status: "comparison"; results: ComparisonResult[] } | { status: string; reason?: string };
type CompareOutcome = { status: "ok"; results: ComparisonResult[] } | { status: "unavailable" };

const verdicts = createPersistentCache<Verdict>("finder.profileComparisonCache.v1", 60 * 24 * 60 * 60 * 1000, 300);

function pairKey(pair: TextPair): string {
  return hashString(JSON.stringify([pair.section, pair.previous, pair.current]));
}

function toChange(pair: TextPair, verdict: Verdict): ProfileChange | null {
  if (!verdict.meaningful) return null;
  return {
    id: pair.id,
    kind: "text_changed",
    section: pair.section,
    significance: verdict.significance,
    direction: verdict.direction,
    title: verdict.title,
    subject: pair.context,
    previous: verdict.previousValue || undefined,
    current: verdict.currentValue || undefined,
    explanation: verdict.explanation || undefined,
  };
}

function requestComparison(pairs: TextPair[]): Promise<CompareOutcome> {
  return sendBackgroundRelayRequest<CompareResponse, CompareOutcome>({
    requestType: LINKWISE_COMPARE_PROFILE,
    cancelType: LINKWISE_CANCEL_COMPARE_PROFILE,
    idPrefix: "compare_req",
    payload: { items: pairs.map(({ id, section, context, previous, current }) => ({ id, section, context, previous, current })) },
    toOutcome: (response) => (response.status === "comparison" && "results" in response ? { status: "ok", results: response.results } : { status: "unavailable" }),
    unavailable: () => ({ status: "unavailable" }),
  }).promise;
}

export async function resolveTextPairs(pairs: TextPair[], request: (pairs: TextPair[]) => Promise<CompareOutcome> = requestComparison): Promise<SemanticResults> {
  await verdicts.hydrate();
  const results: SemanticResults = new Map();
  const uncached: TextPair[] = [];
  for (const pair of pairs) {
    const cached = verdicts.get(pairKey(pair));
    if (cached) results.set(pair.id, toChange(pair, cached));
    else uncached.push(pair);
  }
  const batch = uncached.slice(0, MAX_ITEMS);
  if (batch.length === 0) return results;
  const outcome = await request(batch);
  if (outcome.status !== "ok") return results;
  for (const result of outcome.results) {
    const pair = batch.find((p) => p.id === result.id);
    if (!pair) continue;
    const { id: _id, ...verdict } = result;
    verdicts.set(pairKey(pair), verdict);
    results.set(pair.id, toChange(pair, verdict));
  }
  return results;
}
