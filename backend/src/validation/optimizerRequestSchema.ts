// What the extension sends to the Profile Optimizer endpoints: the viewer's own profile evidence,
// which sections exist, and anything the user told LinkWise that is not on LinkedIn.
import { z } from "zod";
import { MAX_EVIDENCE_ITEMS, MAX_TEXT_LENGTH, evidenceItemSchema } from "./requestSchema";

export const MAX_USER_CONTEXT_LENGTH = 2000;

export const optimizerSectionSchema = z.enum([
  "photo",
  "banner",
  "headline",
  "about",
  "featured",
  "experience",
  "education",
  "projects",
  "skills",
  "certifications",
  "volunteering",
  "honors",
  "organizations",
  "languages",
  "location",
]);

export type OptimizerSection = z.infer<typeof optimizerSectionSchema>;

const sectionPresenceSchema = z.object({
  section: optimizerSectionSchema,
  present: z.boolean(),
  itemCount: z.number().int().min(0).nullable(),
  evidenceIds: z.array(z.string().max(100)).max(MAX_EVIDENCE_ITEMS),
});

const profileSchema = z.object({
  identity: z.string().min(1).max(300),
  evidence: z.array(evidenceItemSchema).max(MAX_EVIDENCE_ITEMS),
});

export const optimizeProfileRequestSchema = z.object({
  profile: profileSchema,
  sections: z.array(sectionPresenceSchema).min(1).max(30),
  userContext: z.string().max(MAX_USER_CONTEXT_LENGTH).default(""),
});

export type OptimizeProfileRequest = z.infer<typeof optimizeProfileRequestSchema>;

export const DRAFT_SECTIONS = ["headline", "about", "experience"] as const;

export const optimizerDraftRequestSchema = z.object({
  profile: profileSchema,
  section: z.enum(DRAFT_SECTIONS),
  // The Experience entry to rewrite; unused for Headline and About.
  evidenceId: z.string().max(100).nullable().default(null),
  guidance: z.string().max(MAX_TEXT_LENGTH).default(""),
  userContext: z.string().max(MAX_USER_CONTEXT_LENGTH).default(""),
});

export type OptimizerDraftRequest = z.infer<typeof optimizerDraftRequestSchema>;

export function trimOptimizerEvidence<T extends { profile: { evidence: { text: string }[] } }>(request: T): T {
  return { ...request, profile: { ...request.profile, evidence: request.profile.evidence.map((item) => ({ ...item, text: item.text.slice(0, MAX_TEXT_LENGTH) })) } };
}
