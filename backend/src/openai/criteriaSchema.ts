// The structured output for POST /api/generate-criteria. Guarantees shape only,
// sanitizeGeneratedCriteria checks quality.
import { z } from "zod";

// Mirrors the extension's CriterionCategory so a generated type maps directly to it.
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

// Only meaningful alongside a non-null value.
export const criterionOperatorSchema = z.enum(["at_least", "at_most", "equals"]);

export const generatedCriterionSchema = z.object({
  // The actual matchable phrase. Must be a full readable phrase, not a compressed keyword.
  label: z.string(),
  type: criterionTypeSchema,
  importance: criterionImportanceSchema,
  operator: criterionOperatorSchema.nullable(),
  // The literal number this criterion expresses, or null if it's not a threshold.
  value: z.string().nullable(),
  // Shared by every criterion in the same "X or Y" group. Null otherwise.
  groupId: z.string().nullable(),
  // The substring of the original description this came from, for traceability.
  sourceText: z.string(),
});

export const generateCriteriaResponseSchema = z.object({
  // A short natural title for who's being searched for, never a copy of the raw input.
  name: z.string(),
  criteria: z.array(generatedCriterionSchema),
});

export type GenerateCriteriaResponse = z.infer<typeof generateCriteriaResponseSchema>;
export type GeneratedCriterion = z.infer<typeof generatedCriterionSchema>;
