// Validates and bounds what the extension sends to POST /api/analyze-profile.
// Oversized text gets trimmed rather than rejected.
import { z } from "zod";

export const MAX_EVIDENCE_ITEMS = 200;
export const MAX_CRITERIA = 50;
export const MAX_TEXT_LENGTH = 2000;
export const MAX_GOAL_DESCRIPTION_LENGTH = 2000;

const criterionImportanceSchema = z.enum(["MUST_HAVE", "PREFERRED", "OPTIONAL", "EXCLUDED"]);

// Mirrors the extension's CriterionCategory. Must include every category the criteria
// generator can produce, or requests for that goal get rejected (this happened once live).
const criterionCategorySchema = z
  .enum([
    "role",
    "location",
    "experience",
    "context",
    "other",
    "organization",
    "membership",
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
  ])
  .optional();
export type CriterionCategoryValue = Exclude<z.infer<typeof criterionCategorySchema>, undefined>;
const evidenceStrengthSchema = z.enum(["strong", "moderate", "weak", "missing", "unknown"]);

// Mirrors models/profile.ts's ProfileSectionName, plus headline and location.
export const evidenceSectionSchema = z.enum([
  "about",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "organizations",
  "volunteering",
  "languages",
  "honors",
  "headline",
  "location",
]);

export type EvidenceSection = z.infer<typeof evidenceSectionSchema>;

const criterionSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
  importance: criterionImportanceSchema,
  category: criterionCategorySchema,
});

// Criteria can be empty since the goal's description alone is enough for AI to reason from.
// Both being empty is the only real invalid case, see the refinement below.
const goalSchema = z
  .object({
    id: z.string().min(1).max(200),
    description: z.string().max(MAX_GOAL_DESCRIPTION_LENGTH * 5).default(""),
    criteria: z.array(criterionSchema).max(MAX_CRITERIA),
  })
  .refine((goal) => goal.description.trim().length > 0 || goal.criteria.length > 0, {
    message: "A goal needs either a description or at least one criterion to analyze against.",
    path: ["description"],
  });

const evidenceItemSchema = z.object({
  id: z.string().min(1).max(100),
  section: evidenceSectionSchema,
  // Just a ceiling to catch abusive payloads. Real trimming happens in trimOversizedText.
  text: z.string().max(MAX_TEXT_LENGTH * 5),
  evidenceType: z.string().min(1).max(50),
});

const profileSchema = z.object({
  identity: z.string().min(1).max(300),
  headline: z.string().max(500).optional(),
  location: z.string().max(300).optional(),
  evidence: z.array(evidenceItemSchema).max(MAX_EVIDENCE_ITEMS),
});

const localCriterionResultSchema = z.object({
  criterionId: z.string().min(1).max(200),
  strength: evidenceStrengthSchema,
  evidenceIds: z.array(z.string().max(100)).max(20).default([]),
});

const localAnalysisSchema = z.object({
  score: z.number().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  profileExtracted: z.boolean(),
  criterionResults: z.array(localCriterionResultSchema).max(MAX_CRITERIA),
});

export const analyzeProfileRequestSchema = z.object({
  goal: goalSchema,
  profile: profileSchema,
  localAnalysis: localAnalysisSchema,
});

export type AnalyzeProfileRequest = z.infer<typeof analyzeProfileRequestSchema>;

// Trims oversized fields instead of rejecting the whole request. Runs after validation.
export function trimOversizedText(request: AnalyzeProfileRequest): AnalyzeProfileRequest {
  return {
    ...request,
    goal: { ...request.goal, description: request.goal.description.slice(0, MAX_GOAL_DESCRIPTION_LENGTH) },
    profile: {
      ...request.profile,
      evidence: request.profile.evidence.map((item) => ({ ...item, text: item.text.slice(0, MAX_TEXT_LENGTH) })),
    },
  };
}
