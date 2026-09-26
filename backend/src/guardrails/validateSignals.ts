import type { ProfileSignal, SignalAnalysisResponse, SignalStrength, SignalType } from "../openai/signalsSchema";

export const MIN_SIGNAL_IMPORTANCE = 0.5;
export const MAX_SIGNALS = 20;
export const MAX_FACTS = 12;
const MAX_QUOTE_LENGTH = 300;
const MIN_QUOTE_LENGTH = 3;
const MAX_FACT_LENGTH = 80;

const STRENGTH_WEIGHT: Record<SignalStrength, number> = { strong: 1, moderate: 0.8, claim: 0 };

export interface EvidenceText {
  id: string;
  section: string;
  text: string;
}

export interface ValidatedSignal {
  evidenceId: string;
  section: string;
  quote: string;
  type: SignalType;
  strength: SignalStrength;
  importance: number;
  metrics: string[];
}

export interface ValidatedFact {
  text: string;
  evidenceId: string;
}

export interface ValidatedSignals {
  signals: ValidatedSignal[];
  facts: ValidatedFact[];
}

function normalizeChar(ch: string): string {
  if (/[‐-―−]/.test(ch)) return "-";
  if (/[‘’‛]/.test(ch)) return "'";
  if (/[“”]/.test(ch)) return '"';
  return ch.toLowerCase();
}

// Normalized text plus, for each normalized char, its index in the original string.
export function normalizeWithMap(input: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      pendingSpace = text.length > 0;
      continue;
    }
    if (pendingSpace) {
      text += " ";
      map.push(i - 1);
      pendingSpace = false;
    }
    text += normalizeChar(ch);
    map.push(i);
  }
  return { text, map };
}

export function normalizeText(input: string): string {
  return normalizeWithMap(input).text;
}

function trimQuote(quote: string): string {
  return quote.trim().replace(/^["'“‘…]+|["'”’…]+$/g, "").replace(/[.,;:]+$/, "").trim();
}

// Returns the exact original substring of haystack matching needle, or null.
export function findGroundedText(haystack: string, needle: string): string | null {
  const target = normalizeText(trimQuote(needle));
  if (target.length === 0) return null;
  const source = normalizeWithMap(haystack);
  const index = source.text.indexOf(target);
  if (index === -1) return null;
  const start = source.map[index]!;
  const end = source.map[index + target.length - 1]! + 1;
  return haystack.slice(start, end);
}

function numbersIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

function factIsGrounded(factText: string, quote: string): boolean {
  const quoteNumbers = new Set(numbersIn(quote));
  return numbersIn(factText).every((n) => quoteNumbers.has(n));
}

// A number is only evidence alongside what it measures, so "4 mos" alone is rejected.
function isBareNumber(quote: string, metrics: string[]): boolean {
  if (!/\d/.test(quote)) return false;
  let rest = quote;
  for (const metric of metrics) rest = rest.replace(metric, " ");
  rest = rest.replace(/\d[\d.,+]*\s*(?:yrs?|years?|mos?|months?|hours?|hrs?)?/gi, " ");
  return (rest.match(/\p{L}{2,}/gu) ?? []).length < 2;
}

function rank(signal: { importance: number; strength: SignalStrength }): number {
  return signal.importance * STRENGTH_WEIGHT[signal.strength];
}

interface CandidateFact {
  text: string;
  quantified: boolean;
}

interface Candidate extends ValidatedSignal {
  facts: CandidateFact[];
}

function toCandidate(raw: ProfileSignal, evidence: Map<string, EvidenceText>): Candidate | null {
  const source = evidence.get(raw.evidenceId);
  if (!source) return null;
  if (!Number.isFinite(raw.importance) || raw.importance < 0 || raw.importance > 1) return null;
  if (raw.strength === "claim" || raw.importance < MIN_SIGNAL_IMPORTANCE) return null;

  const quote = findGroundedText(source.text, raw.quote);
  if (!quote || quote.length < MIN_QUOTE_LENGTH || quote.length > MAX_QUOTE_LENGTH) return null;

  const metrics: string[] = [];
  const facts: CandidateFact[] = [];
  for (const fact of raw.facts) {
    const metric = fact.metric ? findGroundedText(quote, fact.metric) : null;
    if (fact.metric && !metric) continue;
    const text = fact.text.trim();
    if (text.length === 0 || text.length > MAX_FACT_LENGTH || !factIsGrounded(text, quote)) continue;
    if (metric && !metrics.includes(metric)) metrics.push(metric);
    facts.push({ text, quantified: metric !== null });
  }

  if (isBareNumber(quote, metrics)) return null;

  return {
    evidenceId: source.id,
    section: source.section,
    quote,
    type: raw.type,
    strength: raw.strength,
    importance: raw.importance,
    metrics,
    facts,
  };
}

function overlaps(a: Candidate, b: Candidate): boolean {
  if (a.evidenceId !== b.evidenceId) return false;
  const x = normalizeText(a.quote);
  const y = normalizeText(b.quote);
  return x.includes(y) || y.includes(x);
}

export function validateSignals(response: SignalAnalysisResponse, evidenceItems: EvidenceText[]): ValidatedSignals {
  const evidence = new Map(evidenceItems.map((item) => [item.id, item]));
  const candidates = response.signals
    .map((raw) => toCandidate(raw, evidence))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => rank(b) - rank(a));

  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    const existing = kept.find((k) => overlaps(k, candidate));
    if (existing) {
      for (const metric of candidate.metrics) if (!existing.metrics.includes(metric)) existing.metrics.push(metric);
      existing.facts.push(...candidate.facts);
      continue;
    }
    if (kept.length < MAX_SIGNALS) kept.push(candidate);
  }

  const facts: ValidatedFact[] = [];
  const seenFacts = new Set<string>();
  const addFact = (text: string, evidenceId: string): boolean => {
    const key = normalizeText(text);
    if (seenFacts.has(key) || facts.length >= MAX_FACTS) return false;
    seenFacts.add(key);
    facts.push({ text, evidenceId });
    return true;
  };
  for (const signal of kept) {
    for (const fact of signal.facts) if (fact.quantified) addFact(fact.text, signal.evidenceId);
  }
  for (const signal of kept) {
    if (signal.facts.some((f) => f.quantified)) continue;
    signal.facts.find((f) => addFact(f.text, signal.evidenceId));
  }

  return { signals: kept.map(({ facts: _facts, ...signal }) => signal), facts };
}
