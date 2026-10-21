import { z } from "zod";
import { MAX_EVIDENCE_ITEMS, evidenceItemSchema } from "./requestSchema";
import { MAX_USER_CONTEXT_LENGTH } from "./optimizerRequestSchema";

const profileSchema = z.object({
  identity: z.string().min(1).max(300),
  evidence: z.array(evidenceItemSchema).max(MAX_EVIDENCE_ITEMS),
});

export const ANALYZED_SECTIONS = ["banner"] as const;

export const sectionAnalysisRequestSchema = z.object({
  profile: profileSchema,
  section: z.enum(ANALYZED_SECTIONS),
  present: z.boolean(),
  userContext: z.string().max(MAX_USER_CONTEXT_LENGTH).default(""),
});

export type SectionAnalysisRequest = z.infer<typeof sectionAnalysisRequestSchema>;

export const headlineGenerationRequestSchema = z.object({
  profile: profileSchema,
  currentHeadline: z.string().max(400).default(""),
  targetRole: z.string().max(120).default(""),
  keywords: z.string().max(300).default(""),
  additionalContext: z.string().max(1000).default(""),
  language: z.string().min(1).max(40).default("English"),
  userContext: z.string().max(MAX_USER_CONTEXT_LENGTH).default(""),
});

export type HeadlineGenerationRequest = z.infer<typeof headlineGenerationRequestSchema>;

export const aboutGenerationRequestSchema = z.object({
  profile: profileSchema,
  currentAbout: z.string().max(2600).default(""),
  targetRole: z.string().max(120).default(""),
  standOut: z.string().max(300).default(""),
  additionalContext: z.string().max(1000).default(""),
  language: z.string().min(1).max(40).default("English"),
  // Counts explicit Generate clicks, so a regeneration asks for a different take.
  variation: z.number().int().min(1).max(50).default(1),
  userContext: z.string().max(MAX_USER_CONTEXT_LENGTH).default(""),
});

export type AboutGenerationRequest = z.infer<typeof aboutGenerationRequestSchema>;
