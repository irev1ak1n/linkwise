import type { CareerStage, EvidenceFact, SignalClassification, SignalFactType } from "../openai/signalsSchema";

// The model's grades are untrusted: every fact must name a submitted item, quote that item's exact
// text, and keep its grades inside their ranges. What survives is ranked by the extension.
export const MAX_FACTS_PER_ITEM = 8;
const MIN_QUOTE_LENGTH = 3;
const MAX_HIGHLIGHT_LENGTH = 200;
const MAX_HIGHLIGHT_WORDS = 24;
const LIST_MAX_WORDS = 14;
const LIST_LEAD_WORDS = 10;
const MAX_FACT_LENGTH = 90;

export interface EvidenceText {
  id: string;
  section: string;
  text: string;
}

export const GRADE_KEYS = [
  "impact",
  "ownership",
  "result",
  "scale",
  "selectivity",
  "leadership",
  "technicalDepth",
  "sustainedDepth",
  "specificity",
  "distinctiveness",
  "genericness",
] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];
export type Grades = Record<GradeKey, number>;

export interface ValidatedCandidate {
  evidenceId: string;
  section: string;
  quote: string;
  /** The fact as a short grounded line, or null when it named something the item does not say. */
  fact: string | null;
  type: SignalFactType;
  grades: Grades;
  goalRelevance: number;
  confidence: number;
  metrics: string[];
}

export interface ValidatedClassification {
  careerStage: CareerStage;
  candidates: ValidatedCandidate[];
  /** Every submitted item counts as graded, including those the model found nothing in. */
  classified: string[];
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
    // "'26 school" is a year and "11th grade" a grade level, not something measured.
    const before = quote.slice(0, match.index ?? 0);
    const after = quote.slice((match.index ?? 0) + match[0].length);
    if (/['‘’]$/.test(before) || (/^\d+(?:st|nd|rd|th)$/i.test(value) && /^\s*(?:grade|grader|year|semester)\b/i.test(after))) continue;
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

function clampGrade(value: number): number {
  return Number.isFinite(value) ? Math.min(3, Math.max(0, Math.round(value))) : 0;
}

// A phrase like "for a 4,000+ student school" only describes the setting of the real fact.
const CONTEXT_FRAGMENT = /^(?:for|at|of|in|on|from|with|within|across)\s+(?:a|an|the|my|our|their|\d|~)/i;

function groundedQuote(quote: string, source: EvidenceText): { text: string; start: number } | null {
  const found = groundedSpan(source.text, quote);
  const text = found && shortenList(found.text);
  if (!found || !text || text.length < MIN_QUOTE_LENGTH || text.length > MAX_HIGHLIGHT_LENGTH || text.includes(" — ")) return null;
  if (isEntryHeading(text, source) || isBareNumber(text) || CONTEXT_FRAGMENT.test(text)) return null;
  return { text, start: found.start };
}

// The short fact line must only use numbers and names its own item states.
function groundedFact(raw: string, source: EvidenceText): string | null {
  const text = raw.trim().replace(/\.$/, "");
  if (text.length === 0 || text.length > MAX_FACT_LENGTH || text.split(/\s+/).length < 2 || isVagueFact(text)) return null;
  const sourceText = normalizeText(source.text);
  const available = new Set(numbersIn(sourceText));
  return numbersIn(text).every((n) => available.has(n)) && namesAreGrounded(text, sourceText) ? text : null;
}

const STATED_SIZE = /\d|\b(?:dozens|hundreds|thousands|millions|school-?wide|statewide|nationwide|national|international|global)\b/i;
const STATED_DURATION = /\d+\s*\+?\s*(?:years?|yrs?|months?|mos?|weeks?|hours?|hrs?|seasons?|semesters?)\b|\bsince\s+\d{4}\b/i;

function toCandidate(raw: EvidenceFact, source: EvidenceText): (ValidatedCandidate & { start: number }) | null {
  const quote = groundedQuote(raw.quote, source);
  if (!quote) return null;
  const grades = Object.fromEntries(GRADE_KEYS.map((key) => [key, clampGrade(raw[key])])) as Grades;
  // Scale and sustained depth must be stated in the phrase itself, never assumed.
  if (!STATED_SIZE.test(quote.text)) grades.scale = 0;
  if (!STATED_DURATION.test(quote.text)) grades.sustainedDepth = 0;
  const confidence = Number.isFinite(raw.confidence) ? Math.min(1, Math.max(0, raw.confidence)) : 0;
  return {
    evidenceId: source.id,
    section: source.section,
    quote: quote.text,
    fact: groundedFact(raw.fact, source),
    type: raw.type,
    grades,
    goalRelevance: clampGrade(raw.goalRelevance),
    confidence,
    metrics: extractMetrics(quote.text),
    start: quote.start,
  };
}

export function validateClassification(response: SignalClassification, submitted: EvidenceText[]): ValidatedClassification {
  const evidence = new Map(submitted.map((item) => [item.id, item]));
  const candidates: ValidatedCandidate[] = [];
  const seen = new Set<string>();
  for (const item of response.items) {
    const source = evidence.get(item.evidenceId);
    if (!source || source.section === "headline" || source.section === "location") continue;
    const kept = item.facts
      .map((raw) => toCandidate(raw, source))
      .filter((c): c is ValidatedCandidate & { start: number } => c !== null)
      .filter((c) => {
        const key = `${source.id}|${normalizeText(c.quote)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_FACTS_PER_ITEM)
      .sort((a, b) => a.start - b.start);
    candidates.push(...kept.map(({ start: _start, ...candidate }) => candidate));
  }
  return { careerStage: response.careerStage, candidates, classified: submitted.map((item) => item.id) };
}
