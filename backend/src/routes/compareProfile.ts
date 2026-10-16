import type { Request, Response } from "express";
import { compareProfileRequestSchema } from "../validation/compareRequestSchema";
import { COMPARE_SYSTEM_PROMPT, buildCompareUserPrompt, compareResponseSchema, type CompareResponse } from "../openai/compareSchema";
import { createOpenAiStructuredClient, requestStructured } from "../openai/structuredClient";
import { validateComparison } from "../guardrails/validateComparison";
import { invalidRequest, sendFailure, type OptimizerDeps } from "./optimizeProfile";

export async function handleCompareProfile(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = compareProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);

  const result = await requestStructured<CompareResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, compareResponseSchema, "profile_comparison"),
    COMPARE_SYSTEM_PROMPT,
    buildCompareUserPrompt(parsed.data),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "compare-profile", result);
  res.status(200).json({ status: "comparison", model: deps.config.openAiModel, results: validateComparison(result.data, parsed.data) });
}
