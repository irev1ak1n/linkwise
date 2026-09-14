// The structured-output contract for POST /api/generate-criteria — OpenAI must fill this in
// exactly, the same Structured Outputs mechanism used for profile analysis (see
// responseSchema.ts). This alone guarantees SHAPE, not quality; `sanitizeGeneratedCriteria` (see
// ../criteria/sanitizeGeneratedCriteria.ts) is what guards against a degenerate-but-valid
// response (empty labels, an absurd number of criteria).
import { z } from "zod";

/** Mirrors the extension's (widened) CriterionCategory — see src/models/goal.ts. Every value
 * here must also be a valid CriterionCategory member so a generated criterion's `type` can be
 * stored directly as the extension's `category` field with no translation table in between. */
export const criterionTypeSchema = z.enum([
  "role",
  "organization",
  "membership",
  "location",
  "experience",
  "skill",
  "education",
  "language",
  "leadership",
  "mentoring",
  "competition",
  "service",
  "project",
  "industry",
  "interest",
  "other",
]);

export const criterionImportanceSchema = z.enum(["MUST_HAVE", "PREFERRED", "OPTIONAL", "EXCLUDED"]);

/** Only meaningful alongside a non-null `value` — a criterion with no quantifiable number (the
 * overwhelming majority) carries both as null rather than an "exists" sentinel. */
export const criterionOperatorSchema = z.enum(["at_least", "at_most", "equals"]);

export const generatedCriterionSchema = z.object({
  /** The actual matchable phrase — this is what the deterministic matching engine and the
   * profile-analysis AI call both read (see src/matching/semanticMatcher.ts), so it must be a
   * complete, human-readable phrase that preserves every distinction in the source text (a
   * number, "current" vs "former", "member" vs "mentor", etc.) rather than a compressed keyword. */
  label: z.string(),
  type: criterionTypeSchema,
  importance: criterionImportanceSchema,
  operator: criterionOperatorSchema.nullable(),
  /** The literal number/quantity this criterion expresses (e.g. "10", "3 years"), or null when
   * the criterion isn't a quantified threshold. */
  value: z.string().nullable(),
  /** Non-null and shared by every criterion in the same "X or Y" alternative group (mirrors the
   * extension's existing Criterion.groupId — see src/models/goal.ts) — e.g. "React" and "Vue"
   * from "React or Vue" share one groupId; independent (implicitly ANDed) criteria never share
   * one. Null for a criterion that isn't part of an alternative group. */
  groupId: z.string().nullable(),
  /** The substring (or closest paraphrase, if not contiguous) of the original description this
   * criterion was derived from — never invented, purely for the user's own traceability. */
  sourceText: z.string(),
});

export const generateCriteriaResponseSchema = z.object({
  /** A short, human-readable name for this search, e.g. "FRC Mentors". */
  name: z.string(),
  criteria: z.array(generatedCriterionSchema),
});

export type GenerateCriteriaResponse = z.infer<typeof generateCriteriaResponseSchema>;
export type GeneratedCriterion = z.infer<typeof generatedCriterionSchema>;
