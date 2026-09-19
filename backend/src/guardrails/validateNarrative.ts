// Validates the narrative half of OpenAI's response (summary/strengths/gaps). A strength with
// no valid evidence IDs left gets dropped entirely. A gap can legitimately have no evidence
// since it describes an absence, only invalid IDs get stripped from it.
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
  /** Undefined if OpenAI's summary was empty, so callers fall back to the local one. */
  summary: string | undefined;
  strengths: ValidatedStrength[];
  gaps: ValidatedGap[];
  experienceAssessment: AnalysisResponse["experienceAssessment"];
  experienceAssessmentReason: string;
  recommendationReason: string;
  contactRecommendationReason: string;
  saveRecommendationReason: string;
  /** Passed through as-is, already validated by the schema. */
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
