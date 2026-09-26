import { z } from "zod";
import { MAX_EVIDENCE_ITEMS, MAX_TEXT_LENGTH, evidenceItemSchema } from "./requestSchema";

export const analyzeSignalsRequestSchema = z.object({
  profile: z.object({
    identity: z.string().min(1).max(300),
    evidence: z.array(evidenceItemSchema).min(1).max(MAX_EVIDENCE_ITEMS),
  }),
});

export type AnalyzeSignalsRequest = z.infer<typeof analyzeSignalsRequestSchema>;

export function trimSignalsRequest(request: AnalyzeSignalsRequest): AnalyzeSignalsRequest {
  return {
    profile: {
      ...request.profile,
      evidence: request.profile.evidence.map((item) => ({ ...item, text: item.text.slice(0, MAX_TEXT_LENGTH) })),
    },
  };
}
