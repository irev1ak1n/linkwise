// Decides when two lines state the same fact, so a fact is shown once however many ways the posting
// or the AI worded it ("Pays $60,000–$96,600/year" and "Annual salary range is $60,000–$96,600").
import type { JobFinding } from "./jobTypes";

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "with", "is", "are", "be", "this", "that", "it", "as", "by", "from", "you", "your", "will", "would", "role", "position", "job"]);

const numbersOf = (text: string) => (text.replace(/(\d),(\d)/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))).filter((n) => n.length > 1);
const wordsOf = (text: string) => new Set(text.toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^\p{L}\p{N}.+#]+/u).map((w) => w.replace(/^\.|\.$/g, "")).filter((w) => w && !STOP.has(w)));

/** Two lines state the same thing: they share their figures, or one is mostly contained in the other. */
export function isSameFact(a: string, b: string): boolean {
  const [na, nb] = [numbersOf(a), numbersOf(b)];
  const shared = na.filter((n) => nb.includes(n));
  if (shared.length > 0 && shared.length >= Math.min(2, na.length, nb.length)) return true;
  const [wa, wb] = [wordsOf(a), wordsOf(b)];
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (small.size < 2) return false;
  let hit = 0;
  for (const w of small) if (large.has(w)) hit += 1;
  return hit / small.size >= 0.6;
}

/** Keeps each fact once, across all the lists given in priority order; where two say the same thing the fuller one stays. */
export function dedupeAcross(lists: JobFinding[][], limits: number[]): JobFinding[][] {
  const kept: { item: JobFinding; list: number }[] = [];
  lists.forEach((list, listIndex) => {
    for (const item of list) {
      const twin = kept.findIndex((k) => isSameFact(k.item.text, item.text));
      if (twin === -1) kept.push({ item, list: listIndex });
      else if (item.text.length > kept[twin]!.item.text.length && kept[twin]!.list === listIndex) kept[twin] = { item, list: listIndex };
    }
  });
  return lists.map((_, listIndex) => kept.filter((k) => k.list === listIndex).map((k) => k.item).slice(0, limits[listIndex]));
}
