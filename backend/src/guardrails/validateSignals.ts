import type { EntryHighlights, FactKind, HighSignalFact, HighlightRole, SignalAnalysisResponse } from "../openai/signalsSchema";

export const MIN_FACT_IMPORTANCE = 0.4;
// Only a safety net: coverage is decided per entry, and this is filled evenly across entries.
export const MAX_HIGHLIGHTS = 80;
export const MAX_FACTS = 12;
const MIN_QUOTE_LENGTH = 3;
const MAX_HIGHLIGHT_LENGTH = 200;
const MAX_HIGHLIGHT_WORDS = 24;
const LIST_MAX_WORDS = 14;
const LIST_LEAD_WORDS = 10;
const MAX_FACT_LENGTH = 90;
// Highlights may cover at most this share of an evidence item, so a paragraph stays readable.
const MAX_HIGHLIGHT_SHARE = 0.5;
const MIN_HIGHLIGHT_ALLOWANCE = 80;
const ROLE_IMPORTANCE: Record<HighlightRole, number> = { primary: 0.9, secondary: 0.6 };
const QUANTIFIED_FACT_BONUS = 0.15;

export interface EvidenceText {
  id: string;
  section: string;
  text: string;
}

export interface ValidatedHighlight {
  evidenceId: string;
  section: string;
  quote: string;
  type: HighlightRole;
  importance: number;
  metrics: string[];
}

export interface ValidatedFact {
  text: string;
  kind: FactKind;
  evidenceId: string;
  evidenceIds: string[];
}

export interface ValidatedSignals {
  highlights: ValidatedHighlight[];
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

interface Span {
  text: string;
  start: number;
  end: number;
}

// Where needle appears in haystack, as the exact original text and its position.
function groundedSpan(haystack: string, needle: string): Span | null {
  const target = normalizeText(trimQuote(needle));
  if (target.length === 0) return null;
  const source = normalizeWithMap(haystack);
  const index = source.text.indexOf(target);
  if (index === -1) return null;
  const start = source.map[index]!;
  const end = source.map[index + target.length - 1]! + 1;
  return { text: haystack.slice(start, end), start, end };
}

// Returns the exact original substring of haystack matching needle, or null.
export function findGroundedText(haystack: string, needle: string): string | null {
  return groundedSpan(haystack, needle)?.text ?? null;
}

function isBareYear(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value.trim());
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", fifteen: "15", twenty: "20", hundred: "100", thousand: "1000",
  first: "1", second: "2", third: "3", fourth: "4", fifth: "5", sixth: "6", seventh: "7", eighth: "8", ninth: "9", tenth: "10",
};

// Digits plus spelled-out numbers, so "first-place" and "1st place" count as the same value.
function numbersIn(text: string): string[] {
  const digits = (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ""));
  const words = (text.toLowerCase().match(/\p{L}+/gu) ?? []).map((w) => NUMBER_WORDS[w]).filter((n): n is string => n !== undefined);
  return [...digits, ...words];
}

const METRIC_PATTERN =
  /[$€£]\s?\d[\d,.]*\s?(?:k|m|million|billion)?\+?|\d[\d,.]*\+?\s?%|\b\d+(?:st|nd|rd|th)(?:\s+place)?\b|\b(?:first|second|third)[- ]place\b|\bage (?:of )?\d{1,2}\b|\b\d[\d,.]*\+?(?:-[a-z]+)?(?:\s(?:hours?|hrs?|years?|yrs?|months?|mos?|weeks?|days?|people|persons?|students?|peers|users?|customers?|clients?|members?|tickets?|participants?|attendees?|visitors?|followers?|downloads?|views|projects?|countries|languages|teams?|volunteers?|employees?|schools?|events?|websites?|apps?))?/gi;

// Values in a quote worth emphasizing, found locally so the model never has to name them. A bare
// number with nothing attached, or a year, is not a metric.
export function extractMetrics(quote: string): string[] {
  const metrics: string[] = [];
  for (const match of quote.matchAll(METRIC_PATTERN)) {
    const value = match[0].trim();
    if (isBareYear(value) || /^\d[\d,.]*$/.test(value)) continue;
    if (/^(19|20)\d{2}\b/.test(value) && !/[%$+]/.test(value)) continue;
    if (!metrics.includes(value)) metrics.push(value);
  }
  return metrics;
}

const DATE_WORDS = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|present|issued|credential|id)\b/gi;

// A number is only evidence alongside some context, so "4 mos", "Mar 2026 - Present", or a
// credential ID alone is rejected but "Over 6 years" is kept.
function isBareNumber(quote: string): boolean {
  if (!/\d/.test(quote)) return false;
  const rest = quote
    .replace(DATE_WORDS, " ")
    .replace(/\p{L}+-?\d[\p{L}\d-]*/gu, " ")
    .replace(/\d[\d.,+%]*\s*(?:yrs?|years?|mos?|months?|hours?|hrs?)?/gi, " ");
  return (rest.match(/\p{L}{2,}/gu) ?? []).length === 0;
}

// Titles, organizations, and names belong to the entry's heading, not its evidence: never any part
// of the title, nor the whole organization.
function isEntryHeading(quote: string, source: EvidenceText): boolean {
  const parts = source.text.split(" — ");
  if (parts.length < 2) return false;
  const target = normalizeText(quote);
  return normalizeText(parts[0]!).includes(target) || normalizeText(parts[1]!) === target;
}

const wordCount = (text: string) => text.trim().split(/\s+/).length;

// A long list keeps its lead-in and first few items, cut at a comma so it stays exact source text.
function shortenList(quote: string): string | null {
  const isList = (quote.match(/,/g) ?? []).length >= 3;
  if (wordCount(quote) <= (isList ? LIST_MAX_WORDS : MAX_HIGHLIGHT_WORDS)) return quote;
  if (!isList) return null;
  let best: string | null = null;
  for (let i = quote.indexOf(","); i !== -1; i = quote.indexOf(",", i + 1)) {
    const lead = quote.slice(0, i);
    if (wordCount(lead) > LIST_LEAD_WORDS) break;
    if (wordCount(lead) >= 3) best = lead;
  }
  return best;
}

// How many highlights an item can hold: a couple for a short text, more for a dense paragraph.
function entryLimit(text: string): number {
  const words = wordCount(text);
  if (words <= 30) return 2;
  if (words <= 80) return 3;
  if (words <= 150) return 5;
  return 6;
}

interface Candidate extends ValidatedHighlight {
  start: number;
  end: number;
}

function toHighlight(quote: string, role: HighlightRole, source: EvidenceText): Candidate | null {
  const found = groundedSpan(source.text, quote);
  const text = found && shortenList(found.text);
  if (!found || !text || text.length < MIN_QUOTE_LENGTH || text.length > MAX_HIGHLIGHT_LENGTH || text.includes(" — ")) return null;
  if (isEntryHeading(text, source) || isBareNumber(text)) return null;
  const importance = ROLE_IMPORTANCE[role];
  return { evidenceId: source.id, section: source.section, quote: text, type: role, importance, metrics: extractMetrics(text), start: found.start, end: found.start + text.length };
}

// Each item is judged on its own: strongest first, no overlaps, and within its own count and share.
function selectForEntry(entry: EntryHighlights, source: EvidenceText): ValidatedHighlight[] {
  const ordered = [...entry.highlights].sort((a, b) => ROLE_IMPORTANCE[b.role] - ROLE_IMPORTANCE[a.role]);
  const allowance = Math.max(MIN_HIGHLIGHT_ALLOWANCE, source.text.length * MAX_HIGHLIGHT_SHARE);
  const limit = entryLimit(source.text);
  const kept: Candidate[] = [];
  let covered = 0;
  for (const raw of ordered) {
    if (kept.length >= limit) break;
    const candidate = toHighlight(raw.quote, raw.role, source);
    if (!candidate || kept.some((k) => candidate.start < k.end && k.start < candidate.end)) continue;
    if (covered + candidate.quote.length > allowance) continue;
    covered += candidate.quote.length;
    kept.push(candidate);
  }
  return kept.sort((a, b) => a.start - b.start).map(({ start: _start, end: _end, ...highlight }) => highlight);
}

function selectHighlights(entries: EntryHighlights[], evidence: Map<string, EvidenceText>): ValidatedHighlight[] {
  const merged = new Map<string, EntryHighlights>();
  for (const entry of entries) {
    const source = evidence.get(entry.evidenceId);
    if (!source || source.section === "headline" || source.section === "location") continue;
    const existing = merged.get(source.id);
    merged.set(source.id, { evidenceId: source.id, highlights: [...(existing?.highlights ?? []), ...entry.highlights] });
  }
  const perEntry = [...merged.values()].map((entry) => selectForEntry(entry, evidence.get(entry.evidenceId)!));

  // Round-robin, so if the safety cap is ever reached no single entry takes the whole budget.
  const highlights: ValidatedHighlight[] = [];
  for (let round = 0; highlights.length < MAX_HIGHLIGHTS; round++) {
    const next = perEntry.map((list) => list[round]).filter((h): h is ValidatedHighlight => h !== undefined);
    if (next.length === 0) break;
    highlights.push(...next.slice(0, MAX_HIGHLIGHTS - highlights.length));
  }
  return highlights;
}

// A category name standing in for a fact, like "Team size" or "Conference result".
const CATEGORY_LABEL =
  /\b(?:size|result|results|range|scale|count|amount|number|level|involvement|background|overview|details|information|experience|delivered|supported|reach|audience|history)$/i;

export function isVagueFact(text: string): boolean {
  return numbersIn(text).length === 0 && CATEGORY_LABEL.test(text.trim().replace(/[.!]+$/, ""));
}

// Names and acronyms (capitalized words after the first) must appear in the cited evidence.
function namesAreGrounded(text: string, sourceText: string): boolean {
  const words = text.match(/[\p{L}\d][\p{L}\d&'.+#-]*/gu) ?? [];
  return words.slice(1).every((word) => {
    if (!/^\p{Lu}/u.test(word)) return true;
    const stem = word.replace(/'s$/i, "").replace(/[.]+$/, "").toLowerCase();
    const at = sourceText.indexOf(stem);
    for (let i = at; i !== -1; i = sourceText.indexOf(stem, i + 1)) {
      if (i === 0 || !/[\p{L}\d]/u.test(sourceText[i - 1]!)) return true;
    }
    return false;
  });
}

interface FactCandidate extends ValidatedFact {
  score: number;
}

function toFact(raw: HighSignalFact, evidence: Map<string, EvidenceText>): FactCandidate | null {
  const text = raw.text.trim().replace(/\.$/, "");
  if (text.length === 0 || text.length > MAX_FACT_LENGTH || text.split(/\s+/).length < 2) return null;
  if (!Number.isFinite(raw.importance) || raw.importance < MIN_FACT_IMPORTANCE || raw.importance > 1) return null;
  if (raw.support.length === 0 || isVagueFact(text)) return null;

  const evidenceIds: string[] = [];
  for (const support of raw.support) {
    const source = evidence.get(support.evidenceId);
    if (!source || !findGroundedText(source.text, support.quote)) return null;
    if (!evidenceIds.includes(source.id)) evidenceIds.push(source.id);
  }
  const sourceText = normalizeText(evidenceIds.map((id) => evidence.get(id)!.text).join(" "));
  const available = new Set(numbersIn(sourceText));
  const numbers = numbersIn(text);
  if (!numbers.every((n) => available.has(n)) || !namesAreGrounded(text, sourceText)) return null;

  const quantified = numbers.some((n) => !isBareYear(n));
  return { text, kind: raw.kind, evidenceId: evidenceIds[0]!, evidenceIds, score: raw.importance + (quantified ? QUANTIFIED_FACT_BONUS : 0) };
}

function selectFacts(raw: HighSignalFact[], evidence: Map<string, EvidenceText>): ValidatedFact[] {
  const candidates = raw
    .map((f) => toFact(f, evidence))
    .filter((f): f is FactCandidate => f !== null)
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const facts: ValidatedFact[] = [];
  for (const { score: _score, ...fact } of candidates) {
    const key = normalizeText(fact.text);
    if (seen.has(key) || facts.length >= MAX_FACTS) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

export function validateSignals(response: SignalAnalysisResponse, evidenceItems: EvidenceText[]): ValidatedSignals {
  const evidence = new Map(evidenceItems.map((item) => [item.id, item]));
  return { highlights: selectHighlights(response.entries, evidence), facts: selectFacts(response.facts, evidence) };
}
