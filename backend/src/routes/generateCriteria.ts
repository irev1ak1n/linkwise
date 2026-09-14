// Orchestrates POST /api/generate-criteria: validate -> call OpenAI (or report not-configured) ->
// sanitize -> respond. Mirrors routes/analyzeProfile.ts's shape: every branch resolves to a 200
// with a `status` discriminator (malformed input excepted, a real 400), so the extension never
// has to special-case HTTP-level failures separately from "AI just isn't available right now" —
// both mean the same thing to it: fall back to the local parser.
import type { Request, Response } from "express";
import { generateCriteriaRequestSchema } from "../validation/generateCriteriaRequestSchema";
import { requestCriteriaGeneration, type CriteriaGenerationClient } from "../openai/criteriaClient";
import { CRITERIA_SYSTEM_PROMPT, buildCriteriaUserPrompt } from "../openai/criteriaPrompt";
import { sanitizeGeneratedCriteria } from "../criteria/sanitizeGeneratedCriteria";
import type { BackendConfig } from "../config";

export interface GenerateCriteriaDeps {
  config: BackendConfig;
  /** Injected only in tests — a fake CriteriaGenerationClient standing in for the real OpenAI SDK. */
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
    res.status(200).json({ status: "unavailable", reason: "openai_error" });
    return;
  }

  try {
    const { name, criteria } = sanitizeGeneratedCriteria(aiResult.data);
    res.status(200).json({ status: "generated", name, criteria });
  } catch {
    // A well-formed (Zod-valid) response that still fails to sanitize sensibly — degrade
    // gracefully rather than 500; the extension falls back to the local parser either way.
    res.status(200).json({ status: "unavailable", reason: "processing_error" });
  }
}
