import type { Request, Response } from "express";
import { jobAnalysisRequestSchema } from "../validation/jobRequestSchema";
import { JOB_SYSTEM_PROMPT, buildJobUserPrompt, jobResponseSchema, type JobResponse } from "../openai/jobSchema";
import { createOpenAiStructuredClient, requestStructured } from "../openai/structuredClient";
import { validateJob } from "../guardrails/validateJob";
import { invalidRequest, sendFailure, type OptimizerDeps } from "./optimizeProfile";

export async function handleAnalyzeJob(req: Request, res: Response, deps: OptimizerDeps): Promise<void> {
  const parsed = jobAnalysisRequestSchema.safeParse(req.body);
  if (!parsed.success) return invalidRequest(res);

  const result = await requestStructured<JobResponse>(
    deps.config,
    () => createOpenAiStructuredClient(deps.config, jobResponseSchema, "job_analysis"),
    JOB_SYSTEM_PROMPT,
    buildJobUserPrompt(parsed.data),
    { timeoutMs: deps.timeoutMs, client: deps.client },
  );
  if (result.status !== "ok") return sendFailure(res, "analyze-job", result);
  res.status(200).json({ status: "job", model: deps.config.openAiModel, jobId: parsed.data.job.jobId, findings: validateJob(result.data, parsed.data) });
}
