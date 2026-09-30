import type { FactKind, HighSignalFact, HighlightType, InlineHighlight, SignalAnalysisResponse } from "../openai/signalsSchema";

export const MIN_HIGHLIGHT_IMPORTANCE = 0.5;
export const MIN_FACT_IMPORTANCE = 0.4;
export const MAX_HIGHLIGHTS = 40;
export const MAX_FACTS = 12;
const MIN_QUOTE_LENGTH = 3;
const MAX_HIGHLIGHT_LENGTH = 200;
const MAX_HIGHLIGHT_WORDS = 24;
const LIST_LEAD_WORDS = 12;
const MAX_FACT_LENGTH = 90;
// Highlights may cover at most this share of an evidence item, so a paragraph stays readable.
const MAX_HIGHLIGHT_SHARE = 0.6;
const MIN_HIGHLIGHT_ALLOWANCE = 120;
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
  type: HighlightType;
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

// A number is only evidence alongside some context, so "4 mos" alone is rejected but "Over 6 years" is kept.
function isBareNumber(quote: string): boolean {
  if (!/\d/.test(quote)) return false;
  const rest = quote.replace(/\d[\d.,+%]*\s*(?:yrs?|years?|mos?|months?|hours?|hrs?)?/gi, " ");
  return (rest.match(/\p{L}{2,}/gu) ?? []).length === 0;
}

// Titles, organizations, and names on their own belong to the entry's heading, not its evidence.
function isEntryHeading(quote: string, source: EvidenceText): boolean {
  const parts = source.text.split(" — ");
  if (parts.length < 2) return false;
  const target = normalizeText(quote);
  return parts.slice(0, 2).some((part) => normalizeText(part) === target);
}

const wordCount = (text: string) => text.trim().split(/\s+/).length;

// A long list keeps its lead-in and first few items, cut at a comma so it stays exact source text.
function shortenList(quote: string): string | null {
  if (wordCount(quote) <= MAX_HIGHLIGHT_WORDS) return quote;
  if ((quote.match(/,/g) ?? []).length < 4) return null;
  let best: string | null = null;
  for (let i = quote.indexOf(","); i !== -1; i = quote.indexOf(",", i + 1)) {
    const lead = quote.slice(0, i);
    if (wordCount(lead) > LIST_LEAD_WORDS) break;
    if (wordCount(lead) >= 3) best = lead;
  }
  return best;
}

function toHighlight(raw: InlineHighlight, evidence: Map<string, EvidenceText>): ValidatedHighlight | null {
  const source = evidence.get(raw.evidenceId);
  if (!source || source.section === "headline" || source.section === "location") return null;
  if (!Number.isFinite(raw.importance) || raw.importance < MIN_HIGHLIGHT_IMPORTANCE || raw.importance > 1) return null;
  const grounded = findGroundedText(source.text, raw.quote);
  const quote = grounded && shortenList(grounded);
  if (!quote || quote.length < MIN_QUOTE_LENGTH || quote.length > MAX_HIGHLIGHT_LENGTH || quote.includes(" — ")) return null;
  if (isEntryHeading(quote, source) || isBareNumber(quote)) return null;
  return { evidenceId: source.id, section: source.section, quote, type: raw.type, importance: raw.importance, metrics: extractMetrics(quote) };
}

function selectHighlights(raw: InlineHighlight[], evidence: Map<string, EvidenceText>): ValidatedHighlight[] {
  const candidates = raw
    .map((h) => toHighlight(h, evidence))
    .filter((h): h is ValidatedHighlight => h !== null)
    .sort((a, b) => b.importance - a.importance);

  const kept: ValidatedHighlight[] = [];
  const used = new Map<string, number>();
  for (const candidate of candidates) {
    if (kept.length >= MAX_HIGHLIGHTS) break;
    const text = normalizeText(candidate.quote);
    const overlapping = kept.some((k) => {
      if (k.evidenceId !== candidate.evidenceId) return false;
      const other = normalizeText(k.quote);
      return other.includes(text) || text.includes(other);
    });
    if (overlapping) continue;
    const source = evidence.get(candidate.evidenceId)!;
    const allowance = Math.max(MIN_HIGHLIGHT_ALLOWANCE, source.text.length * MAX_HIGHLIGHT_SHARE);
    const covered = (used.get(candidate.evidenceId) ?? 0) + candidate.quote.length;
    if (covered > allowance) continue;
    used.set(candidate.evidenceId, covered);
    kept.push(candidate);
  }
  return kept;
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
  return { highlights: selectHighlights(response.highlights, evidence), facts: selectFacts(response.facts, evidence) };
}
