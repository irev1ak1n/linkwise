// Orchestrates POST /api/analyze-profile: validate → call OpenAI (or report not-configured) →
// guardrail-merge → deterministic score → validate narrative → respond. Every branch here
// resolves to a 200 response with a `status` discriminator (except malformed input, which is a
// real 400) — the extension never has to special-case HTTP-level failures separately from
// "AI just isn't available right now"; both mean the same thing to it: fall back to local.
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
  /** Injected only in tests — a fake AnalysisClient standing in for the real OpenAI SDK. */
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
    res.status(200).json({ status: "unavailable", reason: "openai_error" });
    return;
  }

  try {
    const merge = mergeCriterionAssessments(request, aiResult.data);
    const result = computeFinalScore(request, merge, aiResult.data);
    const suppliedEvidenceIds = new Set(request.profile.evidence.map((e) => e.id));
    const narrative = validateNarrative(aiResult.data, suppliedEvidenceIds);

    res.status(200).json({ status: "ai_analysis", model: deps.config.openAiModel, result, narrative });
  } catch {
    // A well-formed (Zod-valid) AI response can still fail to merge sensibly (e.g. it's
    // internally inconsistent in a way the schema alone can't catch) — degrade gracefully
    // rather than 500 the request; the extension falls back to local either way.
    res.status(200).json({ status: "unavailable", reason: "processing_error" });
  }
}
