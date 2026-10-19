import { z } from "zod";
import { MAX_EVIDENCE_ITEMS, MAX_TEXT_LENGTH, evidenceItemSchema } from "./requestSchema";

export const MAX_CONTEXT_ITEMS = 120;
export const MAX_CONTEXT_TEXT = 200;
export const MAX_GOAL_TEXT = 1500;

// Version 2: only the items still to be graded go in "evidence"; the rest of the profile is short
// context, so a lazy-loaded section never resends what is already graded.
export const analyzeSignalsRequestSchema = z.object({
  version: z.literal(3),
  profile: z.object({
    identity: z.string().min(1).max(300),
    evidence: z.array(evidenceItemSchema).min(1).max(MAX_EVIDENCE_ITEMS),
    context: z
      .array(z.object({ section: z.string().max(40), text: z.string() }))
      .max(MAX_CONTEXT_ITEMS)
      .optional(),
  }),
  goal: z.object({ text: z.string().min(1) }).nullable().optional(),
});

export type AnalyzeSignalsRequest = z.infer<typeof analyzeSignalsRequestSchema>;

export function trimSignalsRequest(request: AnalyzeSignalsRequest): AnalyzeSignalsRequest {
  return {
    ...request,
    profile: {
      ...request.profile,
      evidence: request.profile.evidence.map((item) => ({ ...item, text: item.text.slice(0, MAX_TEXT_LENGTH) })),
      context: request.profile.context?.map((item) => ({ ...item, text: item.text.slice(0, MAX_CONTEXT_TEXT) })),
    },
    goal: request.goal ? { text: request.goal.text.slice(0, MAX_GOAL_TEXT) } : null,
  };
}
