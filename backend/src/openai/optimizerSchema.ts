import { z } from "zod";
import { optimizerSectionSchema } from "../validation/optimizerRequestSchema";

export const optimizerStateSchema = z.enum(["add", "improve", "strong"]);
export const optimizerImpactSchema = z.enum(["high", "medium", "low"]);
export const optimizerSourceSchema = z.enum(["linkedin_profile", "user_context", "general_best_practice"]);

export const sectionAssessmentSchema = z.object({
  section: optimizerSectionSchema,
  state: optimizerStateSchema,
  impact: optimizerImpactSchema,
  reason: z.string(),
  sourceType: optimizerSourceSchema,
  evidenceIds: z.array(z.string()),
  // The exact words from the user's own context that a user_context recommendation relies on.
  contextQuote: z.string().nullable(),
  suggestions: z.array(z.string()),
});

export const optimizerResponseSchema = z.object({
  summary: z.string(),
  assessments: z.array(sectionAssessmentSchema),
});

export const optimizerDraftResponseSchema = z.object({
  draft: z.string(),
});

export type OptimizerState = z.infer<typeof optimizerStateSchema>;
export type OptimizerImpact = z.infer<typeof optimizerImpactSchema>;
export type OptimizerSource = z.infer<typeof optimizerSourceSchema>;
export type SectionAssessment = z.infer<typeof sectionAssessmentSchema>;
export type OptimizerResponse = z.infer<typeof optimizerResponseSchema>;
export type OptimizerDraftResponse = z.infer<typeof optimizerDraftResponseSchema>;
