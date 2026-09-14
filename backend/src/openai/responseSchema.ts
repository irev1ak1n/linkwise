// The structured-output contract OpenAI must fill in exactly — enforced by the SDK's Structured
// Outputs (a Zod schema passed straight to the Responses API), so the model literally cannot
// return arbitrary prose or malformed JSON. This schema alone does NOT make the response
// trustworthy, though: it only guarantees SHAPE. Evidence-ID grounding and guardrail merging
// (see ../guardrails/) are what guarantee the CONTENT is never an unsupported claim.
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

/** The full structured response OpenAI must produce. `criterionAssessments` is what actually
 * feeds the deterministic score (see ../guardrails/mergeCriterionAssessments.ts); everything
 * else here is narrative enrichment, validated separately (../guardrails/validateNarrative.ts)
 * before it's ever shown to a user. */
export const analysisResponseSchema = z.object({
  criterionAssessments: z.array(criterionAssessmentSchema),
  summary: z.string(),
  strengths: z.array(strengthSchema),
  gaps: z.array(gapSchema),
  experienceAssessment: experienceAssessmentSchema,
  recommendation: recommendationSchema,
  recommendationReason: z.string(),
  contactRecommendation: contactRecommendationSchema,
  saveRecommendation: saveRecommendationSchema,
  evidenceConfidence: z.number().min(0).max(1),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
export type CriterionAssessmentResponse = z.infer<typeof criterionAssessmentSchema>;
