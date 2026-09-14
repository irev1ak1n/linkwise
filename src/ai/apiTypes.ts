// The wire contract for what the LinkWise backend's POST /api/analyze-profile returns —
// mirrors backend/src/routes/analyzeProfile.ts's response shape exactly. `result` is JSON that
// deserializes directly into a real `MatchResult` (see ../matching/scoreProfile.ts): the backend
// computes it via the SAME `computeMatchResult` function this extension's local path uses, so
// no remapping is needed on this side.
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

export interface AiNarrativeDTO {
  summary?: string;
  strengths: AiStrengthDTO[];
  gaps: AiGapDTO[];
  experienceAssessment: ExperienceLevel;
  recommendationReason: string;
}

export type AnalyzeProfileApiResponse =
  | { status: "ai_analysis"; model: string; result: MatchResult; narrative: AiNarrativeDTO }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

/** What `requestAiAnalysis` (src/ai/analyzeProfileClient.ts) resolves to — collapses every
 * "AI isn't available right now" reason (backend offline, not configured, timeout, cancelled,
 * bad response, ...) into one `unavailable` outcome, since the extension always reacts to all
 * of them the same way: keep showing the local analysis. Only `ok` carries new data. */
export type AiAnalysisOutcome =
  | { status: "ok"; model: string; result: MatchResult; narrative: AiNarrativeDTO }
  | { status: "unavailable"; reason: string };

/** Mirrors backend/src/openai/criteriaSchema.ts's GeneratedCriterion exactly — `type`/`operator`
 * reuse the extension's own CriterionCategory/CriterionOperator unions rather than a separate
 * near-identical DTO union, since both sides were designed to use the same literal values (see
 * models/goal.ts's CriterionCategory doc comment). */
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

/** What `requestGenerateCriteria` (src/ai/generateCriteriaClient.ts) resolves to — same
 * collapsing-every-failure-into-one-shape pattern as AiAnalysisOutcome above, since the caller
 * (src/ai/generateCriteria.ts) reacts to every failure the same way: fall back to the local
 * parser. */
export type GenerateCriteriaOutcome =
  | { status: "ok"; name: string; criteria: GeneratedCriterionDTO[] }
  | { status: "unavailable"; reason: string };
