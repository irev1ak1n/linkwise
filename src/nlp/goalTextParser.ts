// Deterministic, local, rule-based extraction of a draft goal (name + criteria) from a free-
// text description. This is pattern matching and a small curated vocabulary — NOT AI/LLM
// semantic understanding, and never presented as such. It is intentionally conservative: a
// phrase it doesn't recognize is simply left out of the draft rather than guessed at, and the
// user always reviews/edits the result before it's saved (see the in-page panel's GoalSetupSection).
import type { CriterionCategory, CriterionImportance } from "../models/goal";

export interface DraftCriterion {
  label: string;
  importance: CriterionImportance;
  category?: CriterionCategory;
  /** Set (to the same value) on every criterion produced from one "X or Y" alternative phrase
   * — see `expandSharedTailAlternatives` — so the panel can display them as one bullet joined
   * by "or" instead of implying independent requirements. */
  groupId?: string;
}

export interface GoalDraft {
  name: string;
  criteria: DraftCriterion[];
}

export const GOAL_TEXT_MAX_LENGTH = 1000;

/** A small, maintainable list of common professional/technical domain nouns — used only to
 * pick up an additional loose "context" criterion when the text mentions a recognizable field
 * that wasn't already captured by the more specific patterns below. Deliberately short: this
 * is a helpful bonus signal, not an attempt at a comprehensive taxonomy. */
const DOMAIN_VOCABULARY = [
  "robotics",
  "software",
  "hardware",
  "mechanical",
  "electrical",
  "aerospace",
  "biomedical",
  "civil engineering",
  "chemical engineering",
  "marketing",
  "finance",
  "accounting",
  "sales",
  "design",
  "product management",
  "research",
  "biology",
  "chemistry",
  "physics",
  "data science",
  "machine learning",
  "nonprofit",
  "education",
  "consulting",
  "manufacturing",
  "startup",
  "recruiting",
  "law",
  "medicine",
  "nursing",
];

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Strips a plain trailing plural "s" from the last word only (never touches "ss"/very short
 * words) — "FRC mentors" -> "FRC mentor". A light heuristic, not a real morphological
 * analyzer; good enough since the user reviews the result anyway. */
function singularizeLastWord(phrase: string): string {
  const words = phrase.split(" ");
  const last = words[words.length - 1];
  if (last.length > 3 && last.endsWith("s") && !last.endsWith("ss")) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return words.join(" ");
}

function titleCase(phrase: string): string {
  return phrase
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface ExtractionSpan {
  start: number;
  end: number;
}

/** Replaces an already-consumed span with spaces (same length, so later regex indices in the
 * same pass stay valid) rather than deleting it — keeps every downstream extraction pass
 * working against the original text's positions. */
function blank(text: string, span: ExtractionSpan): string {
  return text.slice(0, span.start) + " ".repeat(span.end - span.start) + text.slice(span.end);
}

const EXCLUSION_PATTERN = /\b(?:not|no|excluding|except|avoid)\s+([a-zA-Z][a-zA-Z\s]{1,40}?)(?=[,.;]|$|\s+(?:who|with|in|and)\b)/gi;
const SUBJECT_PATTERN = /\b(?:looking for|seeking|searching for|want to find|need to find|want|need)\s+(.+?)(?=\s+(?:in|with|who|that|near)\b|[,.;]|$)/i;
const LOCATION_PATTERN = /\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/;
const SKILL_EXPERIENCE_PATTERN = /\bwith\s+(.+?)\s+(?:experience|background)\b/i;

/** Expands "mechanical or aerospace engineering" into ["mechanical engineering", "aerospace
 * engineering"] — distributing a shared trailing noun across "or"-joined single-word
 * alternatives. Left as separate, un-expanded phrases when the pattern doesn't clearly apply
 * (more than one multi-word alternative, or only one alternative at all), rather than
 * guessing. */
function expandSharedTailAlternatives(phrase: string): string[] {
  const parts = phrase.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return [phrase];

  const last = parts[parts.length - 1];
  const lastWords = last.split(" ");
  const allButLastAreSingleWord = parts.slice(0, -1).every((p) => p.split(" ").length === 1);

  if (allButLastAreSingleWord && lastWords.length > 1) {
    const tail = lastWords.slice(1).join(" ");
    return [...parts.slice(0, -1).map((p) => `${p} ${tail}`), last];
  }

  return parts;
}

/**
 * Extracts a draft goal name and criteria from a natural-language description. Deterministic:
 * the same text always produces the same draft. Every criterion is derived from an actual
 * phrase in the input — never invented — and defaults to a reasonable importance the user is
 * expected to review (see the module doc comment).
 */
export function parseGoalDraftFromText(rawText: string): GoalDraft {
  const text = collapseWhitespace(rawText).slice(0, GOAL_TEXT_MAX_LENGTH);
  if (!text) return { name: "", criteria: [] };

  const criteria: DraftCriterion[] = [];
  const seen = new Set<string>();
  function addCriterion(
    label: string,
    importance: CriterionImportance,
    extra?: { category?: CriterionCategory; groupId?: string },
  ): void {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    criteria.push({ label: label.trim(), importance, ...extra });
  }

  let working = text;

  // 1. Exclusions first, and blanked out of `working` so later passes never re-pick them up
  // as a positive signal.
  let exclusionMatch: RegExpExecArray | null;
  EXCLUSION_PATTERN.lastIndex = 0;
  while ((exclusionMatch = EXCLUSION_PATTERN.exec(working)) !== null) {
    const phrase = collapseWhitespace(exclusionMatch[1]);
    if (phrase) addCriterion(phrase, "EXCLUDED");
    working = blank(working, { start: exclusionMatch.index, end: exclusionMatch.index + exclusionMatch[0].length });
    EXCLUSION_PATTERN.lastIndex = exclusionMatch.index + 1;
  }

  // 2. The core subject ("looking for FRC mentors") — becomes the goal name AND a MUST_HAVE.
  const subjectMatch = SUBJECT_PATTERN.exec(working);
  let name = "";
  if (subjectMatch) {
    const subjectPhrase = collapseWhitespace(subjectMatch[1]);
    if (subjectPhrase) {
      name = titleCase(subjectPhrase);
      addCriterion(singularizeLastWord(subjectPhrase), "MUST_HAVE", { category: "role" });
      working = blank(working, {
        start: subjectMatch.index + subjectMatch[0].indexOf(subjectMatch[1]),
        end: subjectMatch.index + subjectMatch[0].indexOf(subjectMatch[1]) + subjectMatch[1].length,
      });
    }
  }

  // 3. Location.
  const locationMatch = LOCATION_PATTERN.exec(working);
  if (locationMatch) {
    addCriterion(locationMatch[1], "PREFERRED", { category: "location" });
    working = blank(working, { start: locationMatch.index, end: locationMatch.index + locationMatch[0].length });
  }

  // 4. "with X (or Y) experience/background" — skill/domain descriptor(s). Alternatives from
  // the same original phrase share a groupId so the panel can display them as one "X or Y"
  // bullet rather than implying they're independently required (see criterionDisplay.ts) —
  // display-only: each still scores as its own separate criterion, unchanged.
  const skillMatch = SKILL_EXPERIENCE_PATTERN.exec(working);
  if (skillMatch) {
    const phrase = collapseWhitespace(skillMatch[1]);
    const expandedPhrases = expandSharedTailAlternatives(phrase);
    const groupId = expandedPhrases.length > 1 ? "experience-alternatives" : undefined;
    for (const expanded of expandedPhrases) {
      addCriterion(expanded, "PREFERRED", { category: "experience", groupId });
    }
    working = blank(working, { start: skillMatch.index, end: skillMatch.index + skillMatch[0].length });
  }

  // 5. Remaining recognizable domain vocabulary anywhere else in the text — a lower-confidence
  // OPTIONAL context signal, only added when not already captured above.
  const lowerWorking = working.toLowerCase();
  for (const term of DOMAIN_VOCABULARY) {
    if (seen.has(term)) continue;
    const pattern = new RegExp(`\\b${term.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(lowerWorking)) addCriterion(term, "OPTIONAL", { category: "context" });
  }

  if (!name) {
    name = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  }

  return { name, criteria };
}

/** Words/phrases that mark a sentence as likely to describe WHO is being looked for, as
 * opposed to unrelated surrounding prose in a longer document (a cover letter, a job
 * description, meeting notes, etc.) — used only to rank sentences for `condenseForGoalText`,
 * never to extract criteria directly (that remains `parseGoalDraftFromText`'s job). */
const GOAL_SIGNAL_PHRASES = [
  "looking for",
  "seeking",
  "searching for",
  "ideal candidate",
  "requirements",
  "must have",
  "required",
  "preferred",
  "nice to have",
  "experience",
  "background",
  "mentor",
  "advisor",
  "advise",
  "skills",
  "qualifications",
];

/**
 * Reduces a long document's text down to a goal-relevant draft under the character budget, by
 * SCORING and SELECTING whole sentences rather than cutting off mid-thought at an arbitrary
 * character count. A sentence scores higher for containing goal-signal phrases, domain
 * vocabulary, or capitalized (proper-noun-like) words. Falls back to the document's first
 * sentences only when nothing scores above zero, so a document with no recognizable signal at
 * all still yields *something* rather than nothing.
 */
export function condenseForGoalText(fullText: string, maxLength: number = GOAL_TEXT_MAX_LENGTH): string {
  const text = collapseWhitespace(fullText);
  if (text.length <= maxLength) return text;

  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) ?? [text];
  const lowerDomainTerms = DOMAIN_VOCABULARY;

  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const phrase of GOAL_SIGNAL_PHRASES) if (lower.includes(phrase)) score += 2;
    for (const term of lowerDomainTerms) if (lower.includes(term)) score += 1;
    if (/\b[A-Z][a-z]+\b/.test(sentence)) score += 1;
    return { sentence: sentence.trim(), index, score };
  });

  const anySignal = scored.some((s) => s.score > 0);
  const ranked = anySignal
    ? [...scored].sort((a, b) => b.score - a.score || a.index - b.index)
    : scored; // no signal anywhere — fall back to document order (first sentences), not a guess

  const selected: typeof scored = [];
  let length = 0;
  for (const candidate of ranked) {
    if (candidate.score === 0 && anySignal) break; // never pad with zero-score filler once we have real signal
    const addition = (selected.length > 0 ? " " : "") + candidate.sentence;
    if (length + addition.length > maxLength) continue;
    selected.push(candidate);
    length += addition.length;
  }

  // Restore original document order for readability, then hard-trim as a last-resort safety
  // net in case even one sentence alone exceeds the budget.
  const ordered = selected.sort((a, b) => a.index - b.index).map((s) => s.sentence);
  const joined = ordered.join(" ");
  return joined.length > maxLength ? `${joined.slice(0, maxLength - 3)}...` : joined;
}
