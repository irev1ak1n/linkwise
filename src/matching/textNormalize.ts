// Pure text utilities for the deterministic matcher. No AI, no network, no randomness.
// Same input always produces the same output.

// Filler words with no matching signal, stripped before keyword comparison. Short and
// conservative on purpose, better to under-strip than drop a word the user actually meant.
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "is",
  "are",
  "be",
  "as",
  "by",
  "from",
  "my",
]);

// Generic qualifier nouns with no real specificity of their own, like "background" or
// "experience". Dropped only when a more specific keyword remains, so "just experience" still
// has something to match.
const GENERIC_QUALIFIER_WORDS = new Set(["background", "experience", "skills", "skill", "knowledge", "expertise"]);

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

// Significant keywords only, stopwords removed and deduplicated. Empty only when the text
// itself is empty or entirely stopwords.
export function significantKeywords(text: string): string[] {
  const normalized = normalizeText(text);
  const words = [...new Set(normalized.split(" ").filter((w) => w.length > 0 && !STOPWORDS.has(w)))];

  const specific = words.filter((w) => !GENERIC_QUALIFIER_WORDS.has(w));
  return specific.length > 0 ? specific : words;
}

// A small, conservative stemmer, not a general Porter stemmer, just enough to treat
// "engineer"/"engineering"/"engineers" as the same keyword. Comparison-only, display always
// shows the original word.
export function stem(word: string): string {
  if (word.length < 6) return word;
  // Doesn't strip "-er"/"-ers", since words like "engineer" or "volunteer" end that way as
  // part of the root. Stripping only "-ing" and a trailing "-s" avoids that failure mode.
  if (word.endsWith("ing") && word.length - 3 >= 4) return word.slice(0, -3);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length - 1 >= 4) return word.slice(0, -1);
  return word;
}

// Splits text into sentences for evidence snippets, a plain split good enough without real NLP.
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const MAX_SNIPPET_LENGTH = 220;

// Trims a long field to a readable snippet, centered on the match position when known.
export function truncateSnippet(text: string, matchIndex = 0): string {
  if (text.length <= MAX_SNIPPET_LENGTH) return text;
  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(text.length, start + MAX_SNIPPET_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
