import { z } from "zod";

// "primary" is strong, impressive evidence; "secondary" is useful context for skimming.
export const highlightRoleSchema = z.enum(["primary", "secondary"]);

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
  quote: z.string(),
  role: highlightRoleSchema,
});

// Highlights are chosen per evidence item, so every meaningful entry is considered on its own.
export const entryHighlightsSchema = z.object({
  evidenceId: z.string(),
  highlights: z.array(inlineHighlightSchema),
});

export const signalAnalysisResponseSchema = z.object({
  facts: z.array(highSignalFactSchema),
  entries: z.array(entryHighlightsSchema),
});

export type HighlightRole = z.infer<typeof highlightRoleSchema>;
export type FactKind = z.infer<typeof factKindSchema>;
export type HighSignalFact = z.infer<typeof highSignalFactSchema>;
export type InlineHighlight = z.infer<typeof inlineHighlightSchema>;
export type EntryHighlights = z.infer<typeof entryHighlightsSchema>;
export type SignalAnalysisResponse = z.infer<typeof signalAnalysisResponseSchema>;
