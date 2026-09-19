// Small text utilities for checking summary quality. Not used as a hard gate, just for tests
// and manual checks against real model output.
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countSentences(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  if (matches) return matches.length;
  return text.trim() ? 1 : 0;
}
