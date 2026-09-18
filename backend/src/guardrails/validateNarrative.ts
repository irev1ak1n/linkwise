// Guardrails for the NARRATIVE half of OpenAI's response (summary/strengths/gaps) — a separate
// concern from `mergeCriterionAssessments.ts`, which guards the SCORE. Even when a criterion
// assessment is correctly grounded, the free-text strengths/gaps arrays are still an
// independent surface OpenAI could pad with unsupported claims, so they get their own
// evidence-ID validation: "Every strength ... must reference actual evidence IDs" is enforced
// here by DROPPING any strength that, after filtering out IDs that were never supplied, has
// none left — an unsupported positive claim is removed entirely rather than shown with a
// dangling citation. Gaps describe an ABSENCE, so they may legitimately cite no evidence at
// all; only invalid IDs are stripped from them, never used as a reason to drop the gap.
import type { CriterionImportance } from "../../../src/models/goal";
import type { AnalysisResponse, ConfidenceLevel } from "../openai/responseSchema";
import { normalizeSummaryLength } from "./normalizeSummary";

export interface ValidatedStrength {
  title: string;
  explanation: string;
  evidenceIds: string[];
}

export interface ValidatedGap {
  title: string;
  explanation: string;
  importance: CriterionImportance;
  evidenceIds: string[];
}

export interface ValidatedNarrative {
  /** undefined when OpenAI's summary was empty/whitespace-only — callers fall back to the
   * local template summary in that case, never an empty string shown as-is. Length-normalized
   * (see normalizeSummary.ts) so a summary that ran long never breaks the panel's layout or the
   * "never exceed 60 words" requirement — a mechanical, sentence-boundary-safe trim, never
   * another API call. */
  summary: string | undefined;
  strengths: ValidatedStrength[];
  gaps: ValidatedGap[];
  experienceAssessment: AnalysisResponse["experienceAssessment"];
  experienceAssessmentReason: string;
  recommendationReason: string;
  contactRecommendationReason: string;
  saveRecommendationReason: string;
  /** OpenAI's own judgment of evidence completeness — already enum-validated by the Structured
   * Outputs schema, so this is a plain passthrough rather than something to re-validate here.
   * See scoring.ts's `confidenceLevelToFloat` for how it feeds the displayed MatchResult. */
  confidenceLevel: ConfidenceLevel;
}

export function validateNarrative(response: AnalysisResponse, suppliedEvidenceIds: ReadonlySet<string>): ValidatedNarrative {
  const strengths: ValidatedStrength[] = response.strengths
    .map((strength) => ({ ...strength, evidenceIds: strength.evidenceIds.filter((id) => suppliedEvidenceIds.has(id)) }))
    .filter((strength) => strength.evidenceIds.length > 0 && strength.title.trim().length > 0);

  const gaps: ValidatedGap[] = response.gaps
    .map((gap) => ({ ...gap, evidenceIds: gap.evidenceIds.filter((id) => suppliedEvidenceIds.has(id)) }))
    .filter((gap) => gap.title.trim().length > 0);

  const trimmedSummary = normalizeSummaryLength(response.summary);

  return {
    summary: trimmedSummary.length > 0 ? trimmedSummary : undefined,
    strengths,
    gaps,
    experienceAssessment: response.experienceAssessment,
    experienceAssessmentReason: response.experienceAssessmentReason.trim(),
    recommendationReason: response.recommendationReason.trim(),
    contactRecommendationReason: response.contactRecommendationReason.trim(),
    saveRecommendationReason: response.saveRecommendationReason.trim(),
    confidenceLevel: response.confidenceLevel,
  };
}
