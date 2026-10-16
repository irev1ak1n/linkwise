// Deterministic text comparison for profile snapshots: decides when two versions of a field
// say the same thing (wording, punctuation, order, spelling, elapsed durations), and pulls out
// the numbers that carry measurable impact.
import { normalizeText, stem } from "../matching/textNormalize";
import type { ChangeDirection, ChangeSignificance } from "./types";

// LinkedIn's own elapsed counters ("9 mos", "1 yr 2 mos") change every month on their own.
const DURATION = /\b\d+\s*(?:yrs?|years?|mos?|months?)\b/gi;

const FILLER = new Set(
  "a an the and or of in on at to for with is are was were be been being as by from my our their his her its this that these those over more than about around nearly almost approximately roughly up into via using used while who which also".split(
    " ",
  ),
);

export function stripDurations(text: string): string {
  return text.replace(DURATION, " ").replace(/·\s*(?=·|$)/g, " ");
}

export function canonicalText(text: string | undefined): string {
  return normalizeText(stripDurations(text ?? ""));
}

function words(text: string): string[] {
  return canonicalText(text)
    .split(" ")
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

export function contentWords(text: string | undefined): Set<string> {
  return new Set(words(text ?? ""));
}

// Bullets and sentences, so reordering them reads as the same text.
function units(text: string): string[] {
  return stripDurations(text)
    .split(/(?<=[.!?])\s+|\n+|\s*[•▪◦·]\s*/)
    .map((part) => canonicalText(part))
    .filter(Boolean)
    .sort();
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j]!;
      row[j] = next;
    }
  }
  return row[b.length]!;
}

// Every differing word is a small spelling fix of one on the other side.
function spellingOnly(previous: Set<string>, current: Set<string>): boolean {
  const added = [...current].filter((w) => !previous.has(w));
  const removed = [...previous].filter((w) => !current.has(w));
  if (added.length === 0 || added.length !== removed.length) return false;
  return added.every((word) => word.length >= 4 && removed.some((old) => editDistance(old, word) <= 2));
}

export interface Metric {
  value: number;
  unit: string;
  text: string;
  percent: boolean;
}

const METRIC = /(\$|€|£)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|thousand|million)?(\+)?(?:\s*(%|percent\b))?(?:\s+([a-z][a-z-]*))?/gi;
const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6 };

export function extractMetrics(text: string | undefined): Metric[] {
  const metrics: Metric[] = [];
  for (const match of stripDurations(text ?? "").matchAll(METRIC)) {
    const [whole, currency, digits, scale, plus, percent, word] = match;
    const value = Number(digits!.replace(/,/g, "")) * (scale ? SCALE[scale.toLowerCase()]! : 1);
    const isYear = Number.isInteger(value) && value >= 1900 && value <= 2100 && !scale && !plus && !percent && !currency;
    if (isYear || value === 0) continue;
    const unitWord = word && !FILLER.has(word.toLowerCase()) ? stem(word.toLowerCase()) : "";
    metrics.push({ value, unit: currency ? currency : percent ? "%" : unitWord, text: whole!.trim(), percent: !!percent });
  }
  return metrics;
}

export interface MetricDifference {
  previous?: Metric;
  current?: Metric;
  significance: ChangeSignificance;
  direction: ChangeDirection;
}

function metricSignificance(previous: Metric, current: Metric): { significance: ChangeSignificance; direction: ChangeDirection } {
  const up = current.value > previous.value;
  const direction: ChangeDirection = up ? "improved" : "weaker";
  if (previous.percent || current.percent) {
    const points = Math.abs(current.value - previous.value);
    return { significance: points >= 20 ? "major" : points >= 5 ? "meaningful" : "minor", direction };
  }
  const ratio = up ? current.value / previous.value : previous.value / current.value;
  return { significance: ratio >= 2 ? "major" : ratio >= 1.2 ? "meaningful" : "minor", direction };
}

export function compareMetrics(previous: Metric[], current: Metric[]): MetricDifference[] {
  const differences: MetricDifference[] = [];
  const leftPrevious = [...previous];
  const leftCurrent: Metric[] = [];
  for (const metric of current) {
    let at = leftPrevious.findIndex((old) => old.unit === metric.unit && old.value === metric.value);
    if (at === -1 && metric.unit) at = leftPrevious.findIndex((old) => old.unit === metric.unit);
    if (at === -1) {
      leftCurrent.push(metric);
      continue;
    }
    const [old] = leftPrevious.splice(at, 1);
    if (old!.value !== metric.value) differences.push({ previous: old, current: metric, ...metricSignificance(old!, metric) });
  }
  // Unlabelled numbers pair up in order when both sides have the same count left.
  if (leftPrevious.length === leftCurrent.length) {
    leftCurrent.forEach((metric, i) => {
      const old = leftPrevious[i]!;
      if (old.value !== metric.value) differences.push({ previous: old, current: metric, ...metricSignificance(old, metric) });
    });
    return differences;
  }
  for (const metric of leftCurrent) differences.push({ current: metric, significance: "meaningful", direction: "improved" });
  for (const old of leftPrevious) differences.push({ previous: old, significance: "meaningful", direction: "weaker" });
  return differences;
}

export type TextVerdict =
  | { verdict: "same" }
  /** The current text continues the previous one, e.g. a fully expanded description. */
  | { verdict: "extended"; metrics: MetricDifference[] }
  | { verdict: "different"; metrics: MetricDifference[]; wordingChanged: boolean };

export function compareText(previous: string | undefined, current: string | undefined): TextVerdict {
  const before = canonicalText(previous);
  const after = canonicalText(current);
  if (before === after) return { verdict: "same" };
  // A clamped "…see more" copy of the same text.
  if (after && before.startsWith(after)) return { verdict: "same" };
  const metrics = compareMetrics(extractMetrics(previous), extractMetrics(current)).filter((m) => m.significance !== "minor");
  if (before && after.startsWith(before)) return { verdict: "extended", metrics };
  if (units(previous ?? "").join("|") === units(current ?? "").join("|")) return { verdict: "same" };
  const previousWords = contentWords(previous);
  const currentWords = contentWords(current);
  const wordingChanged = !sameSet(previousWords, currentWords) && !spellingOnly(previousWords, currentWords);
  if (!wordingChanged && metrics.length === 0) return { verdict: "same" };
  return { verdict: "different", metrics, wordingChanged };
}

export function similarity(a: string | undefined, b: string | undefined): number {
  const left = contentWords(a);
  const right = contentWords(b);
  if (left.size === 0 && right.size === 0) return 1;
  const shared = [...left].filter((w) => right.has(w)).length;
  return shared / (left.size + right.size - shared);
}
