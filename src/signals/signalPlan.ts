// The SignalPlan is what matters on a profile: the claims ranking chose, each with its role, its
// sentence, and its kind. It says nothing about colors; the style plan (signalRuntime) decides how
// each claim looks from the user's settings, so a style change never changes the plan.
import type { InlineHighlightDTO } from "../ai/signalTypes";
import { phraseCategory } from "./highlightCategories";
import type { RankingResult, ScoredCandidate } from "./signalRanking";

// Sentence boundaries inside one item's text: end punctuation followed by space, a line break, a
// bullet, or the " — " that joins an entry's parts.
const BOUNDARY = /[.!?](?=\s)|\n|•| — /g;

export function sentenceIndex(text: string, position: number): number {
  return (text.slice(0, position).match(BOUNDARY) ?? []).length;
}

// Two chosen claims of the same kind that touch ("full-stack" + "final project", or a clause and
// its parenthetical) read better as one highlight than as two side by side.
const JOINABLE_GAP = /^[\s,;:()]{0,3}$/;

interface PlanEntry {
  candidate: ScoredCandidate;
  type: InlineHighlightDTO["type"];
}

function toHighlight({ candidate: c, type }: PlanEntry, itemText: string | undefined): InlineHighlightDTO {
  return {
    evidenceId: c.evidenceId,
    section: c.section,
    quote: c.quote,
    type,
    importance: type === "core" ? 1 : 0.75,
    metrics: c.metrics,
    category: phraseCategory(c),
    claim: c.claim ?? "main",
    group: c.group === undefined ? c.id : `${c.itemKey}#${c.group}`,
    sentence:`${c.evidenceId}:${itemText === undefined ? 0 : sentenceIndex(itemText, c.position)}`,
  };
}

// Core is drawn as core; discovery and the reading layer are both secondary highlights.
export function planHighlights(ranking: Pick<RankingResult, "core" | "discovery"> & Partial<Pick<RankingResult, "reading">>, itemTexts: ReadonlyMap<string, string>): InlineHighlightDTO[] {
  const secondary = [...ranking.discovery, ...(ranking.reading ?? [])];
  const entries: PlanEntry[] = [...ranking.core.map((candidate) => ({ candidate, type: "core" as const })), ...secondary.map((candidate) => ({ candidate, type: "discovery" as const }))];
  const byItem = new Map<string, PlanEntry[]>();
  for (const entry of entries) byItem.set(entry.candidate.evidenceId, [...(byItem.get(entry.candidate.evidenceId) ?? []), entry]);

  const out: InlineHighlightDTO[] = [];
  for (const [evidenceId, group] of byItem) {
    const text = itemTexts.get(evidenceId);
    const sorted = [...group].sort((a, b) => a.candidate.position - b.candidate.position);
    let current: { highlight: InlineHighlightDTO; start: number; end: number } | null = null;
    for (const entry of sorted) {
      const highlight = toHighlight(entry, text);
      const start = entry.candidate.position;
      const end = start + entry.candidate.quote.length;
      if (current && text !== undefined && current.highlight.category === highlight.category && start >= current.end && JOINABLE_GAP.test(text.slice(current.end, start))) {
        current.highlight.quote = text.slice(current.start, end);
        current.highlight.metrics = [...new Set([...current.highlight.metrics, ...highlight.metrics])];
        if (highlight.type === "core") current.highlight.type = "core";
        current.highlight.importance = Math.max(current.highlight.importance, highlight.importance);
        if (highlight.claim === "main") current.highlight.claim = "main";
        current.end = end;
        continue;
      }
      current = { highlight, start, end };
      out.push(highlight);
    }
    if (text !== undefined) for (const h of out) if (h.evidenceId === evidenceId) h.quote = closeParenthesis(text, h.quote);
  }
  // Keep profile order stable: core first, then discovery, as ranking returned them.
  const rank = new Map(entries.map((e, i) => [`${e.candidate.evidenceId}|${e.candidate.quote}`, i]));
  return out.sort((a, b) => (rank.get(`${a.evidenceId}|${a.quote}`) ?? firstRank(a, entries)) - (rank.get(`${b.evidenceId}|${b.quote}`) ?? firstRank(b, entries)));
}

// "program (a program intended for older students" should end at its ")" when one follows.
function closeParenthesis(text: string, quote: string): string {
  const open = (quote.match(/\(/g) ?? []).length - (quote.match(/\)/g) ?? []).length;
  const at = text.indexOf(quote);
  return open > 0 && at !== -1 && text[at + quote.length] === ")" ? `${quote})` : quote;
}

// A merged highlight takes the place of its earliest member.
function firstRank(h: InlineHighlightDTO, entries: PlanEntry[]): number {
  const i = entries.findIndex((e) => e.candidate.evidenceId === h.evidenceId && h.quote.startsWith(e.candidate.quote));
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
