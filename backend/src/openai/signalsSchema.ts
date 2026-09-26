import { z } from "zod";

export const signalTypeSchema = z.enum([
  "role",
  "leadership",
  "quantified_impact",
  "achievement",
  "technical_skill",
  "project_scope",
  "duration",
  "audience_scale",
  "credential",
  "language",
  "other_evidence",
]);

export const signalStrengthSchema = z.enum(["strong", "moderate", "claim"]);

export const signalFactSchema = z.object({
  text: z.string(),
  metric: z.string().nullable(),
});

export const profileSignalSchema = z.object({
  evidenceId: z.string(),
  quote: z.string(),
  type: signalTypeSchema,
  strength: signalStrengthSchema,
  importance: z.number().min(0).max(1),
  facts: z.array(signalFactSchema),
});

export const signalAnalysisResponseSchema = z.object({
  signals: z.array(profileSignalSchema),
});

export type SignalType = z.infer<typeof signalTypeSchema>;
export type SignalStrength = z.infer<typeof signalStrengthSchema>;
export type ProfileSignal = z.infer<typeof profileSignalSchema>;
export type SignalAnalysisResponse = z.infer<typeof signalAnalysisResponseSchema>;
