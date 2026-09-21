// The only file that touches the OpenAI SDK directly. Everything else depends on the
// AnalysisClient interface, so tests never need a real API key. Uses Structured Outputs so the
// model can't return arbitrary prose or malformed JSON.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { analysisResponseSchema, type AnalysisResponse } from "./responseSchema";
import type { BackendConfig } from "../config";

const DEFAULT_TIMEOUT_MS = 20000;
// A slow individual response is common enough in practice to be worth one bounded retry,
// rather than immediately falling back to the local analyzer over a single slow attempt.
const DEFAULT_TIMEOUT_RETRIES = 1;

export interface AnalysisClient {
  analyze(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<AnalysisResponse>;
}

// Never logs or returns the API key.
export function createOpenAiAnalysisClient(config: BackendConfig): AnalysisClient {
  if (!config.openAiApiKey) {
    throw new Error("createOpenAiAnalysisClient called without a configured API key.");
  }
  const client = new OpenAI({ apiKey: config.openAiApiKey });

  return {
    async analyze(systemPrompt, userPrompt, signal) {
      const response = await client.responses.parse(
        {
          model: config.openAiModel,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          text: { format: zodTextFormat(analysisResponseSchema, "linkwise_analysis") },
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

export type OpenAiCallResult =
  | { status: "ok"; data: AnalysisResponse }
  | { status: "not_configured" }
  | { status: "timeout" }
  | { status: "error"; message: string };

// Calls the client with a timeout and turns every failure into a typed result. A timeout gets
// one bounded retry (a fresh attempt, not a resumed one), since a single slow response is more
// common than a genuinely broken connection. A non-timeout error never retries, since it would
// just fail the same way again.
export async function requestAnalysis(
  config: BackendConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; client?: AnalysisClient; timeoutRetries?: number } = {},
): Promise<OpenAiCallResult> {
  if (!options.client && !config.openAiApiKey) {
    return { status: "not_configured" };
  }

  const client = options.client ?? createOpenAiAnalysisClient(config);
  const maxAttempts = 1 + (options.timeoutRetries ?? DEFAULT_TIMEOUT_RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const data = await client.analyze(systemPrompt, userPrompt, controller.signal);
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
