import type { Request, Response } from "express";
import { optimizeProfileRequestSchema, optimizerDraftRequestSchema, trimOptimizerEvidence } from "../validation/optimizerRequestSchema";
import { optimizerDraftResponseSchema, optimizerResponseSchema, type OptimizerDraftResponse, type OptimizerResponse } from "../openai/optimizerSchema";
import { createOpenAiStructuredClient, requestStructured, type StructuredClient, type StructuredResult } from "../openai/structuredClient";
import { OPTIMIZER_DRAFT_SYSTEM_PROMPT, OPTIMIZER_SYSTEM_PROMPT, buildOptimizerDraftUserPrompt, buildOptimizerUserPrompt } from "../openai/optimizerPrompt";
import { validateDraft, validateOptimizerResponse } from "../guardrails/validateOptimizer";
import type { BackendConfig } from "../config";

export interface OptimizerDeps {
  config: BackendConfig;
  client?: StructuredClient;
  timeoutMs?: number;
}

export function sendFailure(res: Response, label: string, result: Exclude<StructuredResult<unknown>, { status: "ok" }>): void {
  if (result.status === "not_configured") {
    res.status(200).json({ status: "not_configured" });
    return;
  }
  if (result.status === "error") console.error(`[${label}] OpenAI call failed:`, result.message);
  res.status(200).json({ status: "unavailable", reason: result.status === "timeout" ? "timeout" : "openai_error" });
}

export function invalidRequest(res: Response): void {
  res.status(400).json({ status: "invalid_request", message: "The request body did not match the expected shape." });
}

export async function handleOptimizeProfile(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = optimizeProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);
  const request = trimOptimizerEvidence(parsed.data);

  const result = await requestStructured<OptimizerResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, optimizerResponseSchema, "profile_optimizer"),
    OPTIMIZER_SYSTEM_PROMPT,
    buildOptimizerUserPrompt(request),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "optimize-profile", result);

  try {
    const validated = validateOptimizerResponse(result.data, request);
    res.status(200).json({ status: "optimizer", model: deps.config.openAiModel, ...validated });
  } catch (error) {
    console.error("[optimize-profile] Failed to process a valid OpenAI response:", error);
    res.status(200).json({ status: "unavailable", reason: "processing_error" });
  }
}

export async function handleOptimizerDraft(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = optimizerDraftRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);
  const request = trimOptimizerEvidence(parsed.data);
  if (request.section === "experience" && !request.profile.evidence.some((item) => item.id === request.evidenceId)) return invalidRequest(res);

  const result = await requestStructured<OptimizerDraftResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, optimizerDraftResponseSchema, "profile_optimizer_draft"),
    OPTIMIZER_DRAFT_SYSTEM_PROMPT,
    buildOptimizerDraftUserPrompt(request),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "optimizer-draft", result);

  const draft = validateDraft(result.data.draft, request);
  if (!draft) {
    res.status(200).json({ status: "unavailable", reason: "ungrounded_draft" });
    return;
  }
  res.status(200).json({ status: "draft", model: deps.config.openAiModel, section: request.section, draft });
}
