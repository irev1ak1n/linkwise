// Decides, per criterion, whether to trust AI's assessment or fall back to the local one.
// Order of rules:
//   1. Local "unknown" wins. Only local knows if enough of the profile was even collected.
//   2. A confirmed Excluded disqualification can never be undone by AI.
//   3. If AI didn't address this criterion, keep local.
//   4. An AI claim with no valid evidence ID is unsupported, fall back to local.
//   5. AI can't downgrade a resolved local answer to "unknown".
//   6. Otherwise use AI's assessment. This is where AI actually improves on local matching.
//
// Any "strong"/"moderate" result must carry real evidence by the time it's used for scoring.
import type { CriterionAssessment } from "../../../src/matching/scoreProfile";
import type { SemanticEvidence } from "../../../src/matching/semanticMatcher";
import type { EvidenceStrength } from "../../../src/models/evidence";
import type { AnalyzeProfileRequest } from "../validation/requestSchema";
import type { AnalysisResponse, CriterionAssessmentResponse } from "../openai/responseSchema";

export interface MergeResult {
  assessments: Map<string, CriterionAssessment>;
  /** Criterion IDs that actually used a grounded AI assessment instead of the local one. */
  aiInformedCriterionIds: Set<string>;
}

function isPositiveStrength(strength: EvidenceStrength): boolean {
  return strength === "strong" || strength === "moderate" || strength === "weak";
}

function toSemanticEvidence(section: string, text: string): SemanticEvidence {
  return { fieldLabel: section, snippet: text, sourceSection: section as SemanticEvidence["sourceSection"] };
}

// Keeps only evidence IDs that were actually supplied. Never trust a made-up citation.
function keepValidEvidenceIds(evidenceIds: string[], suppliedIds: ReadonlySet<string>): string[] {
  return evidenceIds.filter((id) => suppliedIds.has(id));
}

// Builds the local assessment, downgrading a positive claim with no real evidence to "weak".
function buildLocalAssessment(
  request: AnalyzeProfileRequest,
  evidenceById: ReadonlyMap<string, AnalyzeProfileRequest["profile"]["evidence"][number]>,
  criterionId: string,
): CriterionAssessment {
  const local = request.localAnalysis.criterionResults.find((r) => r.criterionId === criterionId);
  if (!local) {
    return { strength: "unknown", explanation: "No local assessment available for this criterion." };
  }

  const firstEvidence = local.evidenceIds[0] ? evidenceById.get(local.evidenceIds[0]) : undefined;

  if (isPositiveStrength(local.strength) && !firstEvidence) {
    return { strength: "weak", explanation: "Local match found but its supporting evidence could not be resolved." };
  }

  return {
    strength: local.strength,
    evidence: firstEvidence ? toSemanticEvidence(firstEvidence.section, firstEvidence.text) : undefined,
    note: firstEvidence ? undefined : "No local evidence found for this criterion.",
    explanation: "Assessed by LinkWise's local deterministic matcher.",
  };
}

export function mergeCriterionAssessments(request: AnalyzeProfileRequest, aiResponse: AnalysisResponse): MergeResult {
  const suppliedEvidenceIds = new Set(request.profile.evidence.map((e) => e.id));
  const evidenceById = new Map(request.profile.evidence.map((e) => [e.id, e]));
  const aiByCriterionId = new Map<string, CriterionAssessmentResponse>(aiResponse.criterionAssessments.map((a) => [a.criterionId, a]));

  const assessments = new Map<string, CriterionAssessment>();
  const aiInformedCriterionIds = new Set<string>();

  for (const criterion of request.goal.criteria) {
    const localAssessment = buildLocalAssessment(request, evidenceById, criterion.id);

    // Rule 1: local unknown wins, only it tracks collection completeness.
    if (localAssessment.strength === "unknown") {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    // Rule 2: a confirmed Excluded disqualification can never be undone by AI.
    if (criterion.importance === "EXCLUDED" && localAssessment.strength === "strong") {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    const ai = aiByCriterionId.get(criterion.id);
    // Rule 3: AI didn't address this criterion.
    if (!ai) {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    const grounded = keepValidEvidenceIds(ai.evidenceIds, suppliedEvidenceIds);
    const groundedEvidence = grounded[0] ? evidenceById.get(grounded[0]) : undefined;

    // Rule 4: an unsupported positive claim is rejected outright.
    if (isPositiveStrength(ai.assessment) && !groundedEvidence) {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    // Rule 5: AI can't add uncertainty to a resolved answer.
    if (ai.assessment === "unknown") {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    // Rule 6: grounded and non-regressive, so use AI's assessment.
    assessments.set(criterion.id, {
      strength: ai.assessment,
      evidence: groundedEvidence ? toSemanticEvidence(groundedEvidence.section, groundedEvidence.text) : undefined,
      note: ai.rationale,
      explanation: ai.rationale,
    });
    aiInformedCriterionIds.add(criterion.id);
  }

  return { assessments, aiInformedCriterionIds };
}
