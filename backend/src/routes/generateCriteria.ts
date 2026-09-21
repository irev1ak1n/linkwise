// Handles POST /api/generate-criteria: validate, call OpenAI, sanitize, respond.
// Same shape as routes/analyzeProfile.ts.
import type { Request, Response } from "express";
import { generateCriteriaRequestSchema } from "../validation/generateCriteriaRequestSchema";
import { requestCriteriaGeneration, type CriteriaGenerationClient } from "../openai/criteriaClient";
import { CRITERIA_SYSTEM_PROMPT, buildCriteriaUserPrompt } from "../openai/criteriaPrompt";
import { sanitizeGeneratedCriteria } from "../criteria/sanitizeGeneratedCriteria";
import type { BackendConfig } from "../config";

export interface GenerateCriteriaDeps {
  config: BackendConfig;
  /** Injected only in tests, a fake CriteriaGenerationClient. */
  client?: CriteriaGenerationClient;
  timeoutMs?: number;
}

export async function handleGenerateCriteria(req: Request, res: Response, deps: GenerateCriteriaDeps): Promise<void> {
  const parseResult = generateCriteriaRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ status: "invalid_request", message: "The request body did not match the expected shape." });
    return;
  }

  const aiResult = await requestCriteriaGeneration(
    deps.config,
    CRITERIA_SYSTEM_PROMPT,
    buildCriteriaUserPrompt(parseResult.data.description),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );

  if (aiResult.status === "not_configured") {
    res.status(200).json({ status: "not_configured" });
    return;
  }
  if (aiResult.status === "timeout") {
    res.status(200).json({ status: "unavailable", reason: "timeout" });
    return;
  }
  if (aiResult.status === "error") {
    console.error("[generate-criteria] OpenAI call failed:", aiResult.message);
    res.status(200).json({ status: "unavailable", reason: "openai_error" });
    return;
  }

  try {
    const { name, criteria } = sanitizeGeneratedCriteria(aiResult.data);
    res.status(200).json({ status: "generated", name, criteria });
  } catch (error) {
    // A valid response can still fail to sanitize. Fall back instead of erroring.
    console.error("[generate-criteria] Failed to process a valid OpenAI response:", error);
    res.status(200).json({ status: "unavailable", reason: "processing_error" });
  }
}
