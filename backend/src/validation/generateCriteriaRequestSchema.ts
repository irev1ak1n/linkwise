// Validates the body of POST /api/generate-criteria — deliberately tiny, since the request
// carries nothing but the user's own free-text description (no profile evidence, no goal state).
import { z } from "zod";

/** Matches the extension's own GOAL_TEXT_MAX_LENGTH (src/nlp/goalTextParser.ts) — the textarea
 * the description comes from already enforces this client-side; this is the server-side floor. */
export const GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH = 1000;

export const generateCriteriaRequestSchema = z.object({
  description: z.string().min(1).max(GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH),
});

export type GenerateCriteriaRequest = z.infer<typeof generateCriteriaRequestSchema>;
