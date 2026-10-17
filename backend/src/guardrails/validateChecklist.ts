// Keeps checklist verdicts grounded: one per requested criterion, citing only evidence that was
// sent, and explanations that name nothing the profile or the user's own context doesn't mention.
import type { ChecklistResponse } from "../openai/checklistSchema";
import type { ChecklistRequest } from "../validation/checklistRequestSchema";
import { isGrounded } from "./validateOptimizer";

const MAX_EXPLANATION_LENGTH = 400;

export interface ChecklistVerdict {
  criterionId: string;
  status: "pass" | "improve";
  explanation: string;
  evidenceIds: string[];
}

export function validateChecklist(response: ChecklistResponse, request: ChecklistRequest): ChecklistVerdict[] {
  const criteria = new Set(request.criteria.map((c) => c.id));
  const evidence = new Set(request.profile.evidence.map((item) => item.id));
  const sources = [...request.profile.evidence.map((item) => item.text), request.userContext].join("\n");
  const verdicts: ChecklistVerdict[] = [];
  for (const result of response.results) {
    if (!criteria.has(result.criterionId) || verdicts.some((v) => v.criterionId === result.criterionId)) continue;
    const explanation = result.explanation.trim();
    // An ungrounded verdict is dropped, so the criterion shows as not assessable rather than wrong.
    if (!explanation || explanation.length > MAX_EXPLANATION_LENGTH || !isGrounded(explanation, sources)) continue;
    verdicts.push({ criterionId: result.criterionId, status: result.status, explanation, evidenceIds: [...new Set(result.evidenceIds.filter((id) => evidence.has(id)))] });
  }
  return verdicts;
}
