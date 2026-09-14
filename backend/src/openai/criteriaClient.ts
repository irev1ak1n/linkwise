// The OpenAI SDK wrapper for POST /api/generate-criteria — structurally identical to
// ./client.ts's analysis wrapper (same Structured Outputs pattern, same not_configured/timeout/
// error handling), kept as its own small file rather than a generic merge of the two: each
// wraps a different Structured Outputs schema, and duplicating this ~30-line shape is cheaper to
// read and maintain than a shared generic would be for two call sites.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { generateCriteriaResponseSchema, type GenerateCriteriaResponse } from "./criteriaSchema";
import type { BackendConfig } from "../config";

const DEFAULT_TIMEOUT_MS = 20000;

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

export async function requestCriteriaGeneration(
  config: BackendConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; client?: CriteriaGenerationClient } = {},
): Promise<CriteriaGenerationResult> {
  if (!options.client && !config.openAiApiKey) {
    return { status: "not_configured" };
  }

  const client = options.client ?? createOpenAiCriteriaClient(config);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const data = await client.generate(systemPrompt, userPrompt, controller.signal);
    return { status: "ok", data };
  } catch (error) {
    if (controller.signal.aborted) {
      return { status: "timeout" };
    }
    return { status: "error", message: error instanceof Error ? error.message : "Unknown OpenAI error" };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
