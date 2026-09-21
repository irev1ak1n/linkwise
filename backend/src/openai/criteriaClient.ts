// The OpenAI wrapper for POST /api/generate-criteria. Same shape as client.ts's analysis
// wrapper, kept separate since each uses a different schema.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { generateCriteriaResponseSchema, type GenerateCriteriaResponse } from "./criteriaSchema";
import type { BackendConfig } from "../config";

const DEFAULT_TIMEOUT_MS = 20000;
// Same reasoning as client.ts's analysis client: one bounded retry for a slow individual
// response, rather than falling back to the local parser over a single slow attempt.
const DEFAULT_TIMEOUT_RETRIES = 1;

export interface CriteriaGenerationClient {
  generate(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<GenerateCriteriaResponse>;
}

export function createOpenAiCriteriaClient(config: BackendConfig): CriteriaGenerationClient {
  if (!config.openAiApiKey) {
    throw new Error("createOpenAiCriteriaClient called without a configured API key.");
  }
  const client = new OpenAI({ apiKey: config.openAiApiKey });

  return {
    async generate(systemPrompt, userPrompt, signal) {
      const response = await client.responses.parse(
        {
          model: config.openAiModel,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          text: { format: zodTextFormat(generateCriteriaResponseSchema, "linkwise_criteria") },
        },
        { signal },
      );

      const parsed = response.output_parsed;
      if (!parsed) {
        throw new Error("OpenAI response could not be parsed into the expected structured format.");
      }
      return parsed;
    },
  };
}

export type CriteriaGenerationResult =
  | { status: "ok"; data: GenerateCriteriaResponse }
  | { status: "not_configured" }
  | { status: "timeout" }
  | { status: "error"; message: string };

// Same retry reasoning as client.ts's requestAnalysis: one bounded retry on timeout only.
export async function requestCriteriaGeneration(
  config: BackendConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; client?: CriteriaGenerationClient; timeoutRetries?: number } = {},
): Promise<CriteriaGenerationResult> {
  if (!options.client && !config.openAiApiKey) {
    return { status: "not_configured" };
  }

  const client = options.client ?? createOpenAiCriteriaClient(config);
  const maxAttempts = 1 + (options.timeoutRetries ?? DEFAULT_TIMEOUT_RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const data = await client.generate(systemPrompt, userPrompt, controller.signal);
      return { status: "ok", data };
    } catch (error) {
      if (!controller.signal.aborted) {
        return { status: "error", message: error instanceof Error ? error.message : "Unknown OpenAI error" };
      }
      if (attempt === maxAttempts) return { status: "timeout" };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
  return { status: "timeout" }; // unreachable, satisfies the return-type checker
}
