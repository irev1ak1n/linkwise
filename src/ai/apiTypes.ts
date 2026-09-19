// The wire contract for POST /api/analyze-profile's response. Mirrors the backend's shape
// exactly, so result deserializes straight into a real MatchResult with no remapping.
import type { MatchResult } from "../matching/scoreProfile";
import type { CriterionCategory, CriterionImportance, CriterionOperator } from "../models/goal";
import type { ExperienceLevel } from "../matching/profileAnalysis";

export interface AiStrengthDTO {
  title: string;
  explanation: string;
  evidenceIds: string[];
}

export interface AiGapDTO {
  title: string;
  explanation: string;
  importance: CriterionImportance;
  evidenceIds: string[];
}

export type AiConfidenceLevel = "low" | "medium" | "high";

export interface AiNarrativeDTO {
  summary?: string;
  strengths: AiStrengthDTO[];
  gaps: AiGapDTO[];
  experienceAssessment: ExperienceLevel;
  experienceAssessmentReason: string;
  recommendationReason: string;
  contactRecommendationReason: string;
  saveRecommendationReason: string;
  /** A plain label so the panel can show e.g. "Medium confidence" directly. */
  confidenceLevel: AiConfidenceLevel;
}

export type AnalyzeProfileApiResponse =
  | { status: "ai_analysis"; model: string; result: MatchResult; narrative: AiNarrativeDTO }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

/** Collapses every "AI isn't available" reason into one outcome, since the extension always
 * reacts the same way: keep showing the local analysis. */
export type AiAnalysisOutcome =
  | { status: "ok"; model: string; result: MatchResult; narrative: AiNarrativeDTO }
  | { status: "unavailable"; reason: string };

// Mirrors the backend's GeneratedCriterion, reusing the extension's own category/operator types.
export interface GeneratedCriterionDTO {
  label: string;
  type: CriterionCategory;
  importance: CriterionImportance;
  operator: CriterionOperator | null;
  value: string | null;
  groupId: string | null;
  sourceText: string;
}

export type GenerateCriteriaApiResponse =
  | { status: "generated"; name: string; criteria: GeneratedCriterionDTO[] }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

// Same collapsing pattern as AiAnalysisOutcome above, the caller always falls back to local.
export type GenerateCriteriaOutcome =
  | { status: "ok"; name: string; criteria: GeneratedCriterionDTO[] }
  | { status: "unavailable"; reason: string };
