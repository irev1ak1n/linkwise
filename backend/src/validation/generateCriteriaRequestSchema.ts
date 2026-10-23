// Validates POST /api/generate-criteria's body, just the user's free-text description.
import { z } from "zod";

// Matches the extension's own GOAL_TEXT_MAX_LENGTH. This is the server-side floor.
export const GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH = 1000;

export const generateCriteriaRequestSchema = z.object({
  description: z.string().min(1).max(GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH),
  // Who the criteria describe: a person (Profile Analyzer) or a job (Job Analyzer).
  kind: z.enum(["person", "job"]).default("person"),
});

export type GenerateCriteriaRequest = z.infer<typeof generateCriteriaRequestSchema>;
