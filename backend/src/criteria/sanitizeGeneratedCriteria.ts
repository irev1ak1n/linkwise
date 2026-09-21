// Catches a valid-but-degenerate response (empty labels, too many criteria, a lonely groupId)
// before it reaches the extension. The schema only checks shape, not sanity.
import type { GenerateCriteriaResponse, GeneratedCriterion } from "../openai/criteriaSchema";

const MAX_CRITERIA = 30;
const MAX_LABEL_LENGTH = 300;
const MAX_SOURCE_TEXT_LENGTH = 300;
const MAX_NAME_LENGTH = 120;

function trimTo(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

const NULLISH_TOKENS = new Set(["null", "none", "undefined", "na"]);

// Some models emit a nullish placeholder instead of a real null, sometimes with stray
// punctuation around it (observed live: ":null"). Left as-is, unrelated criteria could end up
// sharing a fake groupId and get wrongly grouped as alternatives.
function normalizeNullish(text: string | null): string | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const bareToken = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (NULLISH_TOKENS.has(bareToken)) return null;
  return trimmed;
}

export function sanitizeGeneratedCriteria(response: GenerateCriteriaResponse): GenerateCriteriaResponse {
  const normalizedGroupIds = response.criteria.map((c) => normalizeNullish(c.groupId));
  const groupCounts = new Map<string, number>();
  for (const groupId of normalizedGroupIds) {
    if (groupId) groupCounts.set(groupId, (groupCounts.get(groupId) ?? 0) + 1);
  }

  const cleaned: GeneratedCriterion[] = [];
  response.criteria.forEach((c, index) => {
    if (cleaned.length >= MAX_CRITERIA) return;
    const label = trimTo(c.label, MAX_LABEL_LENGTH);
    if (!label) return; // an empty-after-trim label can never be matched against anything

    const value = normalizeNullish(c.value);
    const pairedOperator = value !== null && c.operator !== null;
    const normalizedGroupId = normalizedGroupIds[index]!;
    const groupId = normalizedGroupId && (groupCounts.get(normalizedGroupId) ?? 0) > 1 ? normalizedGroupId : null;

    cleaned.push({
      ...c,
      label,
      sourceText: trimTo(c.sourceText, MAX_SOURCE_TEXT_LENGTH),
      operator: pairedOperator ? c.operator : null,
      value: pairedOperator ? value : null,
      groupId,
    });
  });

  return { name: trimTo(response.name, MAX_NAME_LENGTH), criteria: cleaned };
}
