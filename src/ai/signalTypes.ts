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
  | "milestone"
  | "distinction"
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

/** What a claim is about. Richer than the settings categories, which only style chosen claims. */
export type SemanticLabel =
  | "achievement"
  | "milestone"
  | "selectivity"
  | "distinction"
  | "credential"
  | "completion"
  | "impact"
  | "leadership"
  | "ownership"
  | "technical_execution"
  | "project"
  | "training"
  | "duration"
  | "scale"
  | "skill"
  | "education"
  | "teaching"
  | "responsibility"
  | "language";

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
  /** A sentence's central claim, or a clause that supports one. Main when absent. */
  claim?: "main" | "support";
  /** Claims about the same event share a group within their item. */
  group?: number;
  labels?: SemanticLabel[];
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
  /** A main claim, or a clause shown only beside its main claim; main when absent. */
  claim?: "main" | "support";
  /** Which sentence of which item the claim sits in, for limiting colors per sentence. */
  sentence?: string;
  /** The claim group: a supporting clause shares its main claim's group. */
  group?: string;
}

export interface SignalFactDTO {
  text: string;
  evidenceId: string;
}

export type AnalyzeSignalsApiResponse =
  | { status: "signals"; version: 3; model: string; careerStage: CareerStage; candidates: GradedCandidateDTO[]; classified: string[] }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

export type SignalClassificationOutcome =
  | { status: "ok"; careerStage: CareerStage; candidates: GradedCandidateDTO[]; classified: string[] }
  | { status: "unavailable"; reason: string };
