// Enforces the summary's hard word-count ceiling without ever making another OpenAI request —
// "prefer a backend normalization step for small length violations instead of another API
// request." This is deliberately narrow: it only ever DROPS whole trailing sentences (or, in the
// rare case even the first sentence alone is too long, hard-cuts at a word boundary), so it can
// never turn a grammatical response into a garbled one. It does not try to enforce the 3-4
// sentence count or the 45-55 word TARGET — those are prompt-quality concerns verified live
// (see openai/criteriaPrompt.ts's sibling, prompt.ts), not something safe to mechanically "fix"
// without risking nonsense output.
import { countWords } from "./summaryQuality";

const MAX_SUMMARY_WORDS = 60;

/** Splits on sentence-ending punctuation, keeping the punctuation with the sentence it ends.
 * Good enough for well-formed model prose; anything that doesn't look like separate sentences
 * (no terminal punctuation at all) is treated as one sentence rather than guessed at. */
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (matches && matches.length > 0) return matches.map((s) => s.trim()).filter(Boolean);
  return text ? [text] : [];
}

/**
 * Returns `summary` unchanged if it's already at or under the hard cap. Otherwise keeps whole
 * leading sentences up to the cap and drops the rest — never exceeds MAX_SUMMARY_WORDS in the
 * result. If even the very first sentence alone is over the cap, hard-cuts it at a word boundary
 * and ensures the result still ends with terminal punctuation.
 */
export function normalizeSummaryLength(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed || countWords(trimmed) <= MAX_SUMMARY_WORDS) return trimmed;

  const sentences = splitSentences(trimmed);
  let result = sentences[0]!;
  let wordCount = countWords(result);

  for (let i = 1; i < sentences.length; i++) {
    const sentenceWords = countWords(sentences[i]!);
    if (wordCount + sentenceWords > MAX_SUMMARY_WORDS) break;
    result += " " + sentences[i];
    wordCount += sentenceWords;
  }

  if (wordCount > MAX_SUMMARY_WORDS) {
    const words = result.split(/\s+/).slice(0, MAX_SUMMARY_WORDS);
    result = words.join(" ");
    if (!/[.!?]$/.test(result)) result += ".";
  }

  return result.trim();
}
