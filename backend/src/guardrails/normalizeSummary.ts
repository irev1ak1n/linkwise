// Enforces the summary's hard word limit without another API call. Drops whole trailing
// sentences, or hard-cuts the first one if it's already too long on its own.
import { countWords } from "./summaryQuality";

const MAX_SUMMARY_WORDS = 60;

// Splits on sentence-ending punctuation. Text with none is treated as one sentence.
function splitSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
  if (matches && matches.length > 0) return matches.map((s) => s.trim()).filter(Boolean);
  return text ? [text] : [];
}

// Keeps whole leading sentences up to the word cap and drops the rest.
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
