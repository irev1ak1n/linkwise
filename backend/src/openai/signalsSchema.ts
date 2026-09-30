import { z } from "zod";

export const highlightTypeSchema = z.enum([
  "milestone",
  "duration",
  "early_achievement",
  "selective_admission",
  "ranking",
  "competitive_result",
  "quantified_impact",
  "audience_scale",
  "leadership",
  "responsibility",
  "credential",
  "technical_skill",
  "project_scope",
  "methodology",
  "language",
  "other_evidence",
]);

export const factKindSchema = z.enum([
  "rare_achievement",
  "measurable_impact",
  "competitive_result",
  "leadership",
  "selective_admission",
  "credential",
  "scope",
  "duration",
  "technical_accomplishment",
  "other",
]);

export const factSupportSchema = z.object({
  evidenceId: z.string(),
  quote: z.string(),
});

export const highSignalFactSchema = z.object({
  text: z.string(),
  kind: factKindSchema,
  importance: z.number(),
  support: z.array(factSupportSchema),
});

export const inlineHighlightSchema = z.object({
  evidenceId: z.string(),
  quote: z.string(),
  type: highlightTypeSchema,
  importance: z.number(),
});

export const signalAnalysisResponseSchema = z.object({
  facts: z.array(highSignalFactSchema),
  highlights: z.array(inlineHighlightSchema),
});

export type HighlightType = z.infer<typeof highlightTypeSchema>;
export type FactKind = z.infer<typeof factKindSchema>;
export type HighSignalFact = z.infer<typeof highSignalFactSchema>;
export type InlineHighlight = z.infer<typeof inlineHighlightSchema>;
export type SignalAnalysisResponse = z.infer<typeof signalAnalysisResponseSchema>;
