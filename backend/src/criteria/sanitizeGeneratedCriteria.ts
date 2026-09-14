// Guards against a Structured-Outputs-valid-but-degenerate response (empty labels, an absurd
// criteria count, a groupId shared by only one criterion) before it ever reaches the extension —
// the schema alone only guarantees SHAPE, not that the content is sane.
import type { GenerateCriteriaResponse, GeneratedCriterion } from "../openai/criteriaSchema";

const MAX_CRITERIA = 30;
const MAX_LABEL_LENGTH = 300;
const MAX_SOURCE_TEXT_LENGTH = 300;
const MAX_NAME_LENGTH = 120;

function trimTo(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

/** Some models occasionally emit the literal STRING "null" (or "none"/"undefined") for a
 * nullable free-text field instead of a real JSON null — observed live for `groupId` on an
 * otherwise-correct response. Left unnormalized, three unrelated criteria that each got this
 * placeholder string would all share the same "groupId", and the grouping logic below would
 * wrongly treat them as a real "X or Y or Z" alternative — corrupting AND into OR. Applied to
 * every nullable free-text field defensively, not just the one observed failing. */
function normalizeNullish(text: string | null): string | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (!trimmed || ["null", "none", "undefined", "n/a"].includes(trimmed.toLowerCase())) return null;
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
