// One structured-output call to OpenAI with a timeout and one retry on timeout, for the Profile
// Optimizer's analysis and draft requests.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { BackendConfig } from "../config";

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_TIMEOUT_RETRIES = 1;

export interface StructuredClient {
  complete(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<unknown>;
}

export function createOpenAiStructuredClient<T extends z.ZodTypeAny>(config: BackendConfig, schema: T, name: string): StructuredClient {
  if (!config.openAiApiKey) throw new Error("createOpenAiStructuredClient called without a configured API key.");
  const client = new OpenAI({ apiKey: config.openAiApiKey });
  return {
    async complete(systemPrompt, userPrompt, signal) {
      const response = await client.responses.parse(
        {
          model: config.openAiModel,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          text: { format: zodTextFormat(schema, name) },
        },
        { signal },
      );
      if (!response.output_parsed) throw new Error(`OpenAI response could not be parsed into the ${name} schema.`);
      return response.output_parsed;
    },
  };
}

export type StructuredResult<T> = { status: "ok"; data: T } | { status: "not_configured" } | { status: "timeout" } | { status: "error"; message: string };

export async function requestStructured<T>(
  config: BackendConfig,
  makeClient: () => StructuredClient,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; client?: StructuredClient; timeoutRetries?: number } = {},
): Promise<StructuredResult<T>> {
  if (!options.client && !config.openAiApiKey) return { status: "not_configured" };
  const client = options.client ?? makeClient();
  const maxAttempts = 1 + (options.timeoutRetries ?? DEFAULT_TIMEOUT_RETRIES);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const handle = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      return { status: "ok", data: (await client.complete(systemPrompt, userPrompt, controller.signal)) as T };
    } catch (error) {
      if (!controller.signal.aborted) return { status: "error", message: error instanceof Error ? error.message : "Unknown OpenAI error" };
    } finally {
      clearTimeout(handle);
    }
  }
  return { status: "timeout" };
}
