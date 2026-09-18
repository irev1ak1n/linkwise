// A user-authored goal ("what kind of person am I looking for") and its editable criteria.
// Criteria are free-text and user-defined — there is no fixed taxonomy — matched
// deterministically against profile text by src/matching (never by an AI call).

export type CriterionImportance = "MUST_HAVE" | "PREFERRED" | "OPTIONAL" | "EXCLUDED";

/** What KIND of fact a criterion represents — display-only, never read by matching (see
 * src/matching), which only ever looks at `label`/`importance`. Lets the in-page panel's
 * compact "Your ideal match" card show a short, readable heading ("Role", "Location", ...)
 * instead of a flat list, while the actual criterion driving the score stays exactly the same
 * object. Set by the NLP parser when it recognizes which extraction pattern produced a
 * criterion, or by the AI criteria generator (see src/ai/generateCriteriaClient.ts, which calls
 * this "type" on the wire but stores it here); left unset for manually-added criteria, which
 * fall back to an importance-based heading instead (see linkedin/panel/criterionDisplay.ts).
 * "role"/"location"/"experience"/"context"/"other" are the original local-parser categories;
 * the rest are the AI generator's richer taxonomy — both live in one union rather than two
 * separate near-identical types since both ultimately mean the same thing here. */
export type CriterionCategory =
  | "role"
  | "location"
  | "experience"
  | "context"
  | "other"
  | "organization"
  | "membership"
  | "skill"
  | "education"
  | "language"
  | "leadership"
  | "mentoring"
  | "competition"
  | "service"
  | "project"
  | "industry"
  | "interest";

/** How a criterion's `value` should be compared — only meaningful alongside a non-null `value`
 * (a quantified threshold like "10+ service hours" or "at least 3 years"). Display-only, like
 * `category`/`value`/`sourceText`: matching (src/matching) still reads only `label`/
 * `importance`, so the label itself must already spell out the number and comparison in words
 * (see the AI criteria generator's prompt) — these fields exist for traceability/future display,
 * not because the matching engine consumes them today. */
export type CriterionOperator = "at_least" | "at_most" | "equals";

export interface Criterion {
  id: string;
  /** Free text the user typed, e.g. "FRC mentor", "Python", "still in college" — or, for an
   * AI-generated criterion, a complete phrase preserving the source description's meaning (see
   * src/ai/generateCriteriaClient.ts's doc comment on why this must never be compressed to a
   * bare keyword). This is the ONLY field src/matching ever reads. */
  label: string;
  importance: CriterionImportance;
  category?: CriterionCategory;
  /** Display-only — links criteria that came from the same "X or Y" alternative phrase in the
   * original description (see nlp/goalTextParser.ts's expandSharedTailAlternatives, or the AI
   * generator's own groupId field), so the panel can show them as one bullet joined by "or"
   * instead of implying two independent requirements. Never read by matching: each criterion is
   * still scored on its own. */
  groupId?: string;
  /** The literal quantity a criterion expresses (e.g. "10", "3 years") — set only alongside
   * `operator`. Display-only; see `CriterionOperator`'s doc comment. */
  value?: string;
  operator?: CriterionOperator;
  /** The substring of the original description an AI-generated criterion was derived from —
   * purely for the user's own traceability, never read by matching. */
  sourceText?: string;
}

export interface Goal {
  id: string;
  name: string;
  criteria: Criterion[];
  /** Free-form notes the user attaches to this search intent — persisted alongside the goal,
   * never read by matching/scoring. Purely a place to jot context for themselves. */
  notes?: string;
  /** The raw text the user typed into "Who are you looking for?" — persisted alongside the
   * generated criteria (see linkedin/panel/goalStore.ts's `setActiveGoalCriteria`), never read
   * by matching/scoring itself. Its one job is letting a goal self-heal: if criteria generation
   * ever silently produced nothing usable (a failed AI call, an unusual phrase the local parser
   * doesn't recognize) and the active goal is left with no scoreable criteria, this is what
   * `ensureActiveGoalCriteria` re-runs generation from automatically, with no need for the user
   * to retype anything. Undefined for goals that predate this field, or the built-in starter
   * examples (see `defaultGoals` below), which already ship with real criteria and never need
   * to regenerate anything. */
  description?: string;
}

/** Whether a goal has at least one criterion that can actually contribute to a Match % —
 * EXCLUDED criteria only ever disqualify, never score (see matching/scoreProfile.ts's
 * `computeMatchResult`), so a goal made up entirely of EXCLUDED entries is, for scoring
 * purposes, exactly as criteria-less as one with an empty array. The single source of truth
 * both the scorer and the auto-repair path (`ensureActiveGoalCriteria`) use to answer "does this
 * goal actually have something to score with" — never re-derived separately by either. */
export function hasScoreableCriteria(goal: Goal): boolean {
  return goal.criteria.some((c) => c.importance !== "EXCLUDED");
}

let idCounter = 0;

/** Timestamp-plus-counter id — unique within a single session, which is all that's needed
 * since goals/criteria are only ever referenced from local storage, never shared or synced
 * across devices in this milestone. */
export function generateId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function createCriterion(
  label: string,
  importance: CriterionImportance,
  options?: { category?: CriterionCategory; groupId?: string; value?: string; operator?: CriterionOperator; sourceText?: string },
): Criterion {
  return { id: generateId("criterion"), label, importance, ...options };
}

export function createGoal(name: string): Goal {
  return { id: generateId("goal"), name, criteria: [] };
}

/** Starter examples, matching the mission's own suggestions — fully editable and deletable,
 * never treated as fixed/built-in by any code path. Seeded only the first time the extension
 * runs (see storage/goalsRepository.ts), so a user who deletes them never sees them return. */
export function defaultGoals(): Goal[] {
  return [
    {
      id: generateId("goal"),
      name: "FRC mentor",
      criteria: [
        createCriterion("FRC mentor", "MUST_HAVE"),
        createCriterion("engineering background", "PREFERRED"),
        createCriterion("robotics", "OPTIONAL"),
      ],
    },
    {
      id: generateId("goal"),
      name: "AI collaborator",
      criteria: [
        createCriterion("machine learning", "PREFERRED"),
        createCriterion("research", "OPTIONAL"),
        createCriterion("recruiter", "EXCLUDED"),
      ],
    },
    {
      id: generateId("goal"),
      name: "Internship advice",
      criteria: [
        createCriterion("software engineer", "PREFERRED"),
        createCriterion("intern", "OPTIONAL"),
      ],
    },
    {
      id: generateId("goal"),
      name: "College connection",
      criteria: [createCriterion("student", "PREFERRED"), createCriterion("computer science", "OPTIONAL")],
    },
  ];
}
