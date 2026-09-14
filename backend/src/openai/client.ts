// The ONLY file that touches the OpenAI SDK directly. Wrapped behind a small `AnalysisClient`
// interface so every other module (and every test) depends on that interface, never on the
// "openai" package itself — tests inject a fake client and never need a real API key or network
// access. Uses the Responses API with Structured Outputs (a Zod schema), per the current
// official SDK pattern, so the model cannot return arbitrary prose or malformed JSON.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { analysisResponseSchema, type AnalysisResponse } from "./responseSchema";
import type { BackendConfig } from "../config";

const DEFAULT_TIMEOUT_MS = 20000;

export interface AnalysisClient {
  analyze(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<AnalysisResponse>;
}

/** Never logs the API key, never returns it, never includes it in an error message beyond
 * whatever the SDK itself might throw (which we don't forward verbatim to the extension —
 * see routes/analyzeProfile.ts). */
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

/**
 * Calls the analysis client with a hard timeout, translating every expected failure mode
 * (missing config, timeout, thrown error) into a typed result instead of letting an exception
 * propagate — the route handler always has a clean, gracefully-degradable outcome to act on.
 * `options.client` lets tests inject a fake `AnalysisClient` — no real OpenAI SDK, no API key,
 * no network involved in any test.
 */
export async function requestAnalysis(
  config: BackendConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; client?: AnalysisClient } = {},
): Promise<OpenAiCallResult> {
  if (!options.client && !config.openAiApiKey) {
    return { status: "not_configured" };
  }

  const client = options.client ?? createOpenAiAnalysisClient(config);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const data = await client.analyze(systemPrompt, userPrompt, controller.signal);
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
