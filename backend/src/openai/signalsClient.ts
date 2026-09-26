import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { signalAnalysisResponseSchema, type SignalAnalysisResponse } from "./signalsSchema";
import type { BackendConfig } from "../config";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TIMEOUT_RETRIES = 1;

export interface SignalAnalysisClient {
  analyze(systemPrompt: string, userPrompt: string, signal: AbortSignal): Promise<SignalAnalysisResponse>;
}

export function createOpenAiSignalClient(config: BackendConfig): SignalAnalysisClient {
  if (!config.openAiApiKey) throw new Error("createOpenAiSignalClient called without a configured API key.");
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
          text: { format: zodTextFormat(signalAnalysisResponseSchema, "linkwise_signals") },
        },
        { signal },
      );
      if (!response.output_parsed) throw new Error("OpenAI response could not be parsed into the signal schema.");
      return response.output_parsed;
    },
  };
}

export type SignalAnalysisResult =
  | { status: "ok"; data: SignalAnalysisResponse }
  | { status: "not_configured" }
  | { status: "timeout" }
  | { status: "error"; message: string };

export async function requestSignalAnalysis(
  config: BackendConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { timeoutMs?: number; client?: SignalAnalysisClient; timeoutRetries?: number } = {},
): Promise<SignalAnalysisResult> {
  if (!options.client && !config.openAiApiKey) return { status: "not_configured" };

  const client = options.client ?? createOpenAiSignalClient(config);
  const maxAttempts = 1 + (options.timeoutRetries ?? DEFAULT_TIMEOUT_RETRIES);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      return { status: "ok", data: await client.analyze(systemPrompt, userPrompt, controller.signal) };
    } catch (error) {
      if (!controller.signal.aborted) return { status: "error", message: error instanceof Error ? error.message : "Unknown OpenAI error" };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
  return { status: "timeout" };
}
