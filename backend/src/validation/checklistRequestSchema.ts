import { z } from "zod";
import { MAX_EVIDENCE_ITEMS, evidenceItemSchema } from "./requestSchema";
import { MAX_USER_CONTEXT_LENGTH } from "./optimizerRequestSchema";

export const CHECKLIST_SECTIONS = ["headline", "about", "experience", "education", "projects", "skills", "volunteering"] as const;

export const checklistRequestSchema = z.object({
  profile: z.object({
    identity: z.string().min(1).max(300),
    evidence: z.array(evidenceItemSchema).max(MAX_EVIDENCE_ITEMS),
  }),
  section: z.enum(CHECKLIST_SECTIONS),
  criteria: z
    .array(z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(200), advice: z.string().max(300).default("") }))
    .min(1)
    .max(12),
  userContext: z.string().max(MAX_USER_CONTEXT_LENGTH).default(""),
});

export type ChecklistRequest = z.infer<typeof checklistRequestSchema>;
