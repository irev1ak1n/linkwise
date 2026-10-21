import type { Request, Response } from "express";
import { aboutGenerationRequestSchema, headlineGenerationRequestSchema, sectionAnalysisRequestSchema } from "../validation/sectionRequestSchema";
import { trimOptimizerEvidence } from "../validation/optimizerRequestSchema";
import { aboutOptionsResponseSchema, headlineOptionsResponseSchema, sectionAnalysisResponseSchema, type AboutOptionsResponse, type HeadlineOptionsResponse, type SectionAnalysisResponse } from "../openai/optimizerSchema";
import { createOpenAiStructuredClient, requestStructured } from "../openai/structuredClient";
import { ABOUT_GENERATION_PROMPT, BANNER_ANALYSIS_PROMPT, HEADLINE_GENERATION_PROMPT, buildAboutUserPrompt, buildHeadlineUserPrompt, buildSectionUserPrompt } from "../openai/sectionPrompt";
import { validateAboutOptions, validateHeadlineOptions, validateSectionAnalysis } from "../guardrails/validateSection";
import { invalidRequest, sendFailure, type OptimizerDeps } from "./optimizeProfile";
import { checklistRequestSchema } from "../validation/checklistRequestSchema";
import { CHECKLIST_SYSTEM_PROMPT, buildChecklistUserPrompt, checklistResponseSchema, type ChecklistResponse } from "../openai/checklistSchema";
import { validateChecklist } from "../guardrails/validateChecklist";

export async function handleSectionAnalysis(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = sectionAnalysisRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);
  const request = trimOptimizerEvidence(parsed.data);

  const result = await requestStructured<SectionAnalysisResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, sectionAnalysisResponseSchema, "optimizer_section"),
    BANNER_ANALYSIS_PROMPT,
    buildSectionUserPrompt(request),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "optimizer-section", result);
  res.status(200).json({ status: "section", model: deps.config.openAiModel, section: request.section, ...validateSectionAnalysis(result.data, request) });
}

export async function handleHeadlineGeneration(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = headlineGenerationRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);
  const request = trimOptimizerEvidence(parsed.data);

  const result = await requestStructured<HeadlineOptionsResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, headlineOptionsResponseSchema, "optimizer_headlines"),
    HEADLINE_GENERATION_PROMPT,
    buildHeadlineUserPrompt(request),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "optimizer-headlines", result);
  const options = validateHeadlineOptions(result.data, request);
  if (options.length === 0) {
    res.status(200).json({ status: "unavailable", reason: "ungrounded_headlines" });
    return;
  }
  res.status(200).json({ status: "headlines", model: deps.config.openAiModel, options });
}

export async function handleAboutGeneration(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = aboutGenerationRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);
  const request = trimOptimizerEvidence(parsed.data);

  const result = await requestStructured<AboutOptionsResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, aboutOptionsResponseSchema, "optimizer_abouts"),
    ABOUT_GENERATION_PROMPT,
    buildAboutUserPrompt(request),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "optimizer-abouts", result);
  const options = validateAboutOptions(result.data, request);
  if (options.length === 0) {
    res.status(200).json({ status: "unavailable", reason: "ungrounded_abouts" });
    return;
  }
  res.status(200).json({ status: "abouts", model: deps.config.openAiModel, options });
}

export async function handleChecklist(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = checklistRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);
  const request = trimOptimizerEvidence(parsed.data);

  const result = await requestStructured<ChecklistResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, checklistResponseSchema, "optimizer_checklist"),
    CHECKLIST_SYSTEM_PROMPT,
    buildChecklistUserPrompt(request),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "optimizer-checklist", result);
  res.status(200).json({ status: "checklist", model: deps.config.openAiModel, section: request.section, results: validateChecklist(result.data, request) });
}
