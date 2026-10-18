import { z } from "zod";

// Signal analysis v2: the model classifies evidence, it does not choose what gets highlighted.
// Each fact gets coarse 0-3 grades the extension combines into a deterministic ranking.
export const SIGNAL_CONTRACT_VERSION = 2;

export const signalFactTypeSchema = z.enum([
  "competition_result",
  "award",
  "measurable_impact",
  "leadership_scope",
  "project_ownership",
  "technical_execution",
  "selective_admission",
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

export const careerStageSchema = z.enum(["student", "early_career", "professional", "senior", "unknown"]);

// Ordinal grades: 0 none, 1 weak, 2 moderate, 3 strong. Validated and clamped on the way out.
export const evidenceFactSchema = z.object({
  quote: z.string(),
  fact: z.string(),
  type: signalFactTypeSchema,
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
export type CareerStage = z.infer<typeof careerStageSchema>;
export type EvidenceFact = z.infer<typeof evidenceFactSchema>;
export type SignalClassification = z.infer<typeof signalClassificationSchema>;
