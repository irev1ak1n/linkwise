// A user-authored goal and its editable criteria. Criteria are free-text with no fixed
// taxonomy, matched deterministically against profile text, never by an AI call.

export type CriterionImportance = "MUST_HAVE" | "PREFERRED" | "OPTIONAL" | "EXCLUDED";

// What kind of fact a criterion represents, display-only, never read by matching. Lets the
// panel show a short heading like "Role" or "Location" instead of a flat list. Set by the NLP
// parser or the AI criteria generator, left unset for manually-added criteria.
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

// How a criterion's value should be compared, only meaningful with a non-null value.
// Display-only, matching still only reads label/importance.
export type CriterionOperator = "at_least" | "at_most" | "equals";

export interface Criterion {
  id: string;
  /** Free text the user typed, or a full phrase for an AI-generated criterion, never
   * compressed to a bare keyword. The only field matching ever reads. */
  label: string;
  importance: CriterionImportance;
  category?: CriterionCategory;
  /** Display-only, links criteria from the same "X or Y" phrase so the panel can show them as
   * one bullet. Never read by matching, each criterion is still scored on its own. */
  groupId?: string;
  /** The literal quantity a criterion expresses, set only alongside operator. Display-only. */
  value?: string;
  operator?: CriterionOperator;
  /** The substring of the description an AI-generated criterion came from, for traceability only. */
  sourceText?: string;
}

export interface Goal {
  id: string;
  name: string;
  criteria: Criterion[];
  /** Free-form notes the user attaches, never read by matching/scoring. */
  notes?: string;
}

let idCounter = 0;

// Timestamp-plus-counter id, unique within a session, which is all that's needed since goals
// are only ever referenced from local storage.
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

// Starter examples, fully editable and deletable. Seeded only the first time the extension
// runs, so a deleted one never comes back.
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
