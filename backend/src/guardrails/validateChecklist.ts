// Keeps checklist verdicts grounded: one per requested criterion, citing only evidence that was
// sent, and explanations that name nothing the profile or the user's own context doesn't mention.
import type { ChecklistResponse } from "../openai/checklistSchema";
import type { ChecklistRequest } from "../validation/checklistRequestSchema";
import { isGrounded } from "./validateOptimizer";

const MAX_EXPLANATION_LENGTH = 400;

// Something that actually distinguishes a person: a number, a result, a role they led, something built,
// a ranking, a credential, years of depth. Where someone studies or works, or a plain title, is not.
const DISTINGUISHING = /\d[\d,.]*\+?\s*(%|k\b|m\b|users?|students?|people|customers?|clients?|hours?|years?|yrs?|projects?|placements?|members?)|\b(award|winner|won|champion|finalist|place[ds]?|ranked|top \d+|captain|president|founder|co-?founder|led|lead|leads|leader|built|launched|created|founded|certified|published|speaker|author|helping|serving|specializ\w+)\b|\b\d+\+/i;

const GENERIC_DIFFERENTIATOR_NOTE = "Your headline names where you study or your role, which is background rather than something that sets you apart. Add your strongest proof, such as a project result, leadership, or a distinctive credential.";

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
    // A school, a plain title, or a location is context. Passing "differentiator" needs real proof in the headline.
    const headline = request.profile.evidence.find((item) => item.section === "headline")?.text;
    if (result.criterionId === "headline-differentiator" && result.status === "pass" && headline && !DISTINGUISHING.test(headline)) {
      verdicts.push({ criterionId: result.criterionId, status: "improve", explanation: GENERIC_DIFFERENTIATOR_NOTE, evidenceIds: [...new Set(result.evidenceIds.filter((id) => evidence.has(id)))] });
      continue;
    }
    verdicts.push({ criterionId: result.criterionId, status: result.status, explanation, evidenceIds: [...new Set(result.evidenceIds.filter((id) => evidence.has(id)))] });
  }
  return verdicts;
}
