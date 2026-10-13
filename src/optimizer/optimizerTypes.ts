import type { OptimizerSection } from "./sections";

export type OptimizerState = "add" | "improve" | "strong";
export type OptimizerImpact = "high" | "medium" | "low";
// Where a recommendation comes from: what LinkedIn shows, what the user told LinkWise, or general
// advice that claims nothing about this person.
export type OptimizerSource = "linkedin_profile" | "user_context" | "general_best_practice";

export interface SectionAssessmentDTO {
  section: OptimizerSection;
  state: OptimizerState;
  impact: OptimizerImpact;
  reason: string;
  sourceType: OptimizerSource;
  evidenceIds: string[];
  suggestions: string[];
}

export interface OptimizerResultDTO {
  summary: string;
  sections: SectionAssessmentDTO[];
}

export type OptimizeProfileApiResponse =
  | ({ status: "optimizer"; model: string } & OptimizerResultDTO)
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

export type OptimizerOutcome = { status: "ok"; result: OptimizerResultDTO } | { status: "unavailable"; reason: string };

export type DraftSection = "headline" | "about" | "experience";

export type OptimizerDraftApiResponse =
  | { status: "draft"; model: string; section: DraftSection; draft: string }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

export type DraftOutcome = { status: "ok"; draft: string } | { status: "unavailable"; reason: string };
