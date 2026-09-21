// Handles POST /api/analyze-profile: validate, call OpenAI, merge, score, respond.
// Every branch returns 200 with a status field, except malformed input which is a real 400.
import type { Request, Response } from "express";
import { analyzeProfileRequestSchema, trimOversizedText } from "../validation/requestSchema";
import { requestAnalysis, type AnalysisClient } from "../openai/client";
import { SYSTEM_PROMPT, buildUserPrompt } from "../openai/prompt";
import { mergeCriterionAssessments } from "../guardrails/mergeCriterionAssessments";
import { validateNarrative } from "../guardrails/validateNarrative";
import { computeFinalScore } from "../scoring";
import type { BackendConfig } from "../config";

export interface AnalyzeProfileDeps {
  config: BackendConfig;
  /** Injected only in tests, a fake AnalysisClient. */
  client?: AnalysisClient;
  timeoutMs?: number;
}

export async function handleAnalyzeProfile(req: Request, res: Response, deps: AnalyzeProfileDeps): Promise<void> {
  const parseResult = analyzeProfileRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ status: "invalid_request", message: "The request body did not match the expected shape." });
    return;
  }

  const request = trimOversizedText(parseResult.data);

  const aiResult = await requestAnalysis(deps.config, SYSTEM_PROMPT, buildUserPrompt(request), {
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
    // The client only ever sees "openai_error", but this is the one place the real reason
    // is knowable at all, so it's the only place that can log it for diagnosis.
    console.error("[analyze-profile] OpenAI call failed:", aiResult.message);
    res.status(200).json({ status: "unavailable", reason: "openai_error" });
    return;
  }

  try {
    const merge = mergeCriterionAssessments(request, aiResult.data);
    const result = computeFinalScore(request, merge, aiResult.data);
    const suppliedEvidenceIds = new Set(request.profile.evidence.map((e) => e.id));
    const narrative = validateNarrative(aiResult.data, suppliedEvidenceIds);

    res.status(200).json({ status: "ai_analysis", model: deps.config.openAiModel, result, narrative });
  } catch (error) {
    // A valid response can still fail to merge sensibly. Fall back instead of erroring.
    console.error("[analyze-profile] Failed to process a valid OpenAI response:", error);
    res.status(200).json({ status: "unavailable", reason: "processing_error" });
  }
}
