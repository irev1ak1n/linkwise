import { z } from "zod";

// Signal analysis v3: the model reads each item as claims (a main claim and the clauses that
// support it), grades them, and labels them. It never chooses what is highlighted: the extension
// ranks the graded claims deterministically, and only then decides how each is colored.
export const SIGNAL_CONTRACT_VERSION = 3;

export const signalFactTypeSchema = z.enum([
  "competition_result",
  "award",
  "measurable_impact",
  "leadership_scope",
  "project_ownership",
  "technical_execution",
  "selective_admission",
  "milestone",
  "distinction",
  "credential",
  "sustained_training",
  "teaching_scope",
  "volunteering_impact",
  "responsibility",
  "education",
  "coursework",
  "skill",
  "language",
  "membership",
  "self_description",
  "other",
]);

// What a claim is about, richer than the settings categories; a claim usually has one to three.
export const semanticLabelSchema = z.enum([
  "achievement",
  "milestone",
  "selectivity",
  "distinction",
  "credential",
  "completion",
  "impact",
  "leadership",
  "ownership",
  "technical_execution",
  "project",
  "training",
  "duration",
  "scale",
  "skill",
  "education",
  "teaching",
  "responsibility",
  "language",
]);

export const careerStageSchema = z.enum(["student", "early_career", "professional", "senior", "unknown"]);

// Ordinal grades: 0 none, 1 weak, 2 moderate, 3 strong. Validated and clamped on the way out.
export const evidenceFactSchema = z.object({
  quote: z.string(),
  fact: z.string(),
  type: signalFactTypeSchema,
  /** "main" is the sentence's central claim; "support" explains or qualifies a main claim. */
  claim: z.enum(["main", "support"]),
  /** Claims about the same event share a group number within their item. */
  group: z.number(),
  labels: z.array(semanticLabelSchema),
  impact: z.number(),
  ownership: z.number(),
  result: z.number(),
  scale: z.number(),
  selectivity: z.number(),
  leadership: z.number(),
  technicalDepth: z.number(),
  sustainedDepth: z.number(),
  specificity: z.number(),
  distinctiveness: z.number(),
  goalRelevance: z.number(),
  genericness: z.number(),
  confidence: z.number(),
});

export const itemFactsSchema = z.object({
  evidenceId: z.string(),
  facts: z.array(evidenceFactSchema),
});

export const signalClassificationSchema = z.object({
  careerStage: careerStageSchema,
  items: z.array(itemFactsSchema),
});

export type SignalFactType = z.infer<typeof signalFactTypeSchema>;
export type SemanticLabel = z.infer<typeof semanticLabelSchema>;
export type CareerStage = z.infer<typeof careerStageSchema>;
export type EvidenceFact = z.infer<typeof evidenceFactSchema>;
export type SignalClassification = z.infer<typeof signalClassificationSchema>;
