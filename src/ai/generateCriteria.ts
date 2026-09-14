// Orchestrates "turn this description into criteria": try the AI generator first, and fall back
// to the existing deterministic local parser only when AI is unavailable or returns nothing
// useful — never the other way around (see nlp/goalTextParser.ts, which remains the fallback,
// not the primary path, per the mission this file implements).
import type { CriterionCategory, CriterionImportance, CriterionOperator } from "../models/goal";
import { parseGoalDraftFromText } from "../nlp/goalTextParser";
import { requestGenerateCriteria as defaultRequestGenerateCriteria } from "./generateCriteriaClient";

export interface CriteriaDraftItem {
  label: string;
  importance: CriterionImportance;
  category?: CriterionCategory;
  groupId?: string;
  value?: string;
  operator?: CriterionOperator;
  sourceText?: string;
}

export interface CriteriaGenerationResult {
  name: string;
  criteria: CriteriaDraftItem[];
  /** Which path actually produced these criteria — surfaced so the UI can be transparent about
   * it (and so callers can tell "AI produced zero criteria" apart from "AI was unavailable,
   * local also found nothing" if ever needed), never shown as a competing second result. */
  source: "ai" | "local";
}

/**
 * `description` should already be trimmed/non-empty — callers (GoalSetupSection) gate the
 * "Create criteria" button on that. Never throws: every failure mode (AI unavailable, timeout,
 * malformed response) resolves to the local-parser result instead.
 */
export async function generateCriteria(
  description: string,
  options: { requestGenerateCriteria?: typeof defaultRequestGenerateCriteria } = {},
): Promise<CriteriaGenerationResult> {
  const request = options.requestGenerateCriteria ?? defaultRequestGenerateCriteria;
  const { promise } = request(description);
  const outcome = await promise;

  if (outcome.status === "ok" && outcome.criteria.length > 0) {
    return {
      name: outcome.name,
      source: "ai",
      criteria: outcome.criteria.map((c) => ({
        label: c.label,
        importance: c.importance,
        category: c.type,
        groupId: c.groupId ?? undefined,
        value: c.value ?? undefined,
        operator: c.operator ?? undefined,
        sourceText: c.sourceText,
      })),
    };
  }

  const draft = parseGoalDraftFromText(description);
  return { name: draft.name, source: "local", criteria: draft.criteria };
}
