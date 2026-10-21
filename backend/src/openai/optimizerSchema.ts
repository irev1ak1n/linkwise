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

// The summary comes last so it is written from the assessments above it.
export const optimizerResponseSchema = z.object({
  assessments: z.array(sectionAssessmentSchema),
  summary: z.string(),
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

export const HEADLINE_ASPECTS = ["role", "skills", "keywords", "specificity", "focus", "differentiation", "readability", "accuracy"] as const;

export const sectionAnalysisResponseSchema = z.object({
  status: z.enum(["strong", "improve"]),
  summary: z.string(),
  findings: z.array(z.object({ aspect: z.enum(HEADLINE_ASPECTS), verdict: z.enum(["good", "improve"]), note: z.string() })),
  ideas: z.array(z.string()),
});

export const headlineOptionsResponseSchema = z.object({
  options: z.array(z.object({ label: z.string(), headline: z.string() })),
});

export const aboutOptionsResponseSchema = z.object({
  options: z.array(z.object({ label: z.string(), text: z.string() })),
});

export type AboutOptionsResponse = z.infer<typeof aboutOptionsResponseSchema>;
export type SectionAnalysisResponse = z.infer<typeof sectionAnalysisResponseSchema>;
export type HeadlineOptionsResponse = z.infer<typeof headlineOptionsResponseSchema>;
