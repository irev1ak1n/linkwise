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

/** How completely the supplied evidence lets the model judge the goal's requirements — see
 * ../scoring.ts's `confidenceLevelToFloat` for how this maps onto the extension's existing
 * 0-1 `MatchResult.confidence` (and therefore the "Limited profile information" UI gate). */
export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);

/** The full structured response OpenAI must produce. Under the AI-first architecture, OpenAI
 * itself is the primary source of the final `matchPercent` and `confidenceLevel` — see
 * ../scoring.ts's `computeFinalScore`, which takes these directly rather than recomputing a
 * score from criterionAssessments. `criterionAssessments` still feeds the guardrail-merged
 * per-criterion `reasons`/`missing`/`complete` breakdown (see ../guardrails/
 * mergeCriterionAssessments.ts) and the one hard guardrail that CAN still override the AI's own
 * score: a confirmed Excluded disqualification. Everything else here is narrative enrichment,
 * validated separately (../guardrails/validateNarrative.ts) before it's ever shown to a user. */
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
