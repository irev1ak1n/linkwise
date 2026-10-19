import type { PhraseCategory } from "../signals/highlightCategories";
import type { ProfileSectionName } from "../models/profile";

export type SignalSection = ProfileSectionName | "headline" | "location";

export type SignalFactType =
  | "competition_result"
  | "award"
  | "measurable_impact"
  | "leadership_scope"
  | "project_ownership"
  | "technical_execution"
  | "selective_admission"
  | "credential"
  | "sustained_training"
  | "teaching_scope"
  | "volunteering_impact"
  | "responsibility"
  | "education"
  | "coursework"
  | "skill"
  | "language"
  | "membership"
  | "self_description"
  | "other";

export type CareerStage = "student" | "early_career" | "professional" | "senior" | "unknown";

export const GRADE_KEYS = [
  "impact",
  "ownership",
  "result",
  "scale",
  "selectivity",
  "leadership",
  "technicalDepth",
  "sustainedDepth",
  "specificity",
  "distinctiveness",
  "genericness",
] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];
/** Coarse 0-3 grades: none, weak, moderate, strong. */
export type Grades = Record<GradeKey, number>;

// One graded fact inside one evidence item, as the backend validated it: an exact quote of the
// item's text plus grades. Ranking these into highlights happens locally (see signals/).
export interface GradedCandidateDTO {
  evidenceId: string;
  section: SignalSection;
  quote: string;
  fact: string | null;
  type: SignalFactType;
  grades: Grades;
  goalRelevance: number;
  confidence: number;
  metrics: string[];
}

// An exact phrase to highlight in the profile text.
export interface InlineHighlightDTO {
  evidenceId: string;
  section: SignalSection;
  quote: string;
  /** Core highlights are the stable strongest evidence; discovery ones may rotate between visits. */
  type: "core" | "discovery";
  importance: number;
  metrics: string[];
  /** The kind of evidence, which decides only how the phrase is colored. */
  category: PhraseCategory;
}

export interface SignalFactDTO {
  text: string;
  evidenceId: string;
}

export type AnalyzeSignalsApiResponse =
  | { status: "signals"; version: 2; model: string; careerStage: CareerStage; candidates: GradedCandidateDTO[]; classified: string[] }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

export type SignalClassificationOutcome =
  | { status: "ok"; careerStage: CareerStage; candidates: GradedCandidateDTO[]; classified: string[] }
  | { status: "unavailable"; reason: string };
