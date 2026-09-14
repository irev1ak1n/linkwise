// Small, independently testable text-shape utilities used to check summary quality — both by
// this backend's own tests (against known example text) and, informally, by live manual
// verification against real model output. Deliberately NOT wired into request validation as a
// pass/fail gate: sentence count and the 45-55 word target are prompt-quality concerns (verified
// live), unlike the hard 60-word ceiling normalizeSummary.ts actually enforces mechanically.
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countSentences(text: string): number {
  const matches = text.trim().match(/[^.!?]+[.!?]+/g);
  if (matches) return matches.length;
  return text.trim() ? 1 : 0;
}
