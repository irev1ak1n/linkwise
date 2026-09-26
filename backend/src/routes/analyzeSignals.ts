import type { Request, Response } from "express";
import { analyzeSignalsRequestSchema, trimSignalsRequest } from "../validation/signalsRequestSchema";
import { requestSignalAnalysis, type SignalAnalysisClient } from "../openai/signalsClient";
import { SIGNALS_SYSTEM_PROMPT, buildSignalsUserPrompt } from "../openai/signalsPrompt";
import { validateSignals } from "../guardrails/validateSignals";
import type { BackendConfig } from "../config";

export interface AnalyzeSignalsDeps {
  config: BackendConfig;
  client?: SignalAnalysisClient;
  timeoutMs?: number;
}

export async function handleAnalyzeSignals(req: Request, res: Response, deps: AnalyzeSignalsDeps): Promise<void> {
  const parsed = analyzeSignalsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ status: "invalid_request", message: "The request body did not match the expected shape." });
    return;
  }

  const request = trimSignalsRequest(parsed.data);
  const aiResult = await requestSignalAnalysis(deps.config, SIGNALS_SYSTEM_PROMPT, buildSignalsUserPrompt(request), {
    timeoutMs: deps.timeoutMs,
    client: deps.client,
  });

  if (aiResult.status === "not_configured") {
    res.status(200).json({ status: "not_configured" });
    return;
  }
  if (aiResult.status === "timeout") {
    res.status(200).json({ status: "unavailable", reason: "timeout" });
    return;
  }
  if (aiResult.status === "error") {
    console.error("[analyze-signals] OpenAI call failed:", aiResult.message);
    res.status(200).json({ status: "unavailable", reason: "openai_error" });
    return;
  }

  try {
    const { signals, facts } = validateSignals(aiResult.data, request.profile.evidence);
    const rejected = aiResult.data.signals.length - signals.length;
    if (rejected > 0) console.info(`[analyze-signals] kept ${signals.length}, dropped ${rejected} signals`);
    res.status(200).json({ status: "signals", model: deps.config.openAiModel, signals, facts });
  } catch (error) {
    console.error("[analyze-signals] Failed to process a valid OpenAI response:", error);
    res.status(200).json({ status: "unavailable", reason: "processing_error" });
  }
}
