// The structured output OpenAI must fill in exactly. This only guarantees shape, not truth.
// See ../guardrails/ for how the content itself gets checked.
import { z } from "zod";

export const evidenceStrengthSchema = z.enum(["strong", "moderate", "weak", "missing", "unknown"]);

export const criterionAssessmentSchema = z.object({
  criterionId: z.string(),
  assessment: evidenceStrengthSchema,
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
  rationale: z.string(),
});

export const strengthSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  evidenceIds: z.array(z.string()),
});

export const gapSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  importance: z.enum(["MUST_HAVE", "PREFERRED", "OPTIONAL", "EXCLUDED"]),
  evidenceIds: z.array(z.string()),
});

export const experienceAssessmentSchema = z.enum(["limited", "developing", "relevant", "strong", "extensive"]);

export const recommendationSchema = z.enum([
  "strong_candidate",
  "worth_contacting",
  "investigate_further",
  "low_priority",
  "not_worth_prioritizing",
]);

export const contactRecommendationSchema = z.enum(["recommended", "maybe", "not_recommended"]);
export const saveRecommendationSchema = z.enum(["save", "consider_saving", "skip"]);

// How complete the evidence was for judging this goal. See scoring.ts's confidenceLevelToFloat.
export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);

/** OpenAI's own matchPercent and confidenceLevel are the final score shown to the user (see
 * ../scoring.ts). A confirmed Excluded disqualification is the one thing that can still
 * override it. Everything else here is narrative, validated separately in ../guardrails/. */
export const analysisResponseSchema = z.object({
  matchPercent: z.number().int().min(0).max(100),
  confidenceLevel: confidenceLevelSchema,
  criterionAssessments: z.array(criterionAssessmentSchema),
  summary: z.string(),
  strengths: z.array(strengthSchema),
  gaps: z.array(gapSchema),
  experienceAssessment: experienceAssessmentSchema,
  experienceAssessmentReason: z.string(),
  recommendation: recommendationSchema,
  recommendationReason: z.string(),
  contactRecommendation: contactRecommendationSchema,
  contactRecommendationReason: z.string(),
  saveRecommendation: saveRecommendationSchema,
  saveRecommendationReason: z.string(),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type CriterionAssessmentResponse = z.infer<typeof criterionAssessmentSchema>;
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;
