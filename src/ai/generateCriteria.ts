// Turns a description into criteria. Tries AI first, falls back to the local parser only
// when AI is unavailable or returns nothing useful.
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
  /** Which path actually produced these criteria. */
  source: "ai" | "local";
}

// Never throws, every failure mode falls back to the local parser instead.
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
