// Sends a job posting for the AI reading through the background worker (see background/aiRelay.ts).
import { sendBackgroundRelayRequest, type PendingRelayRequest } from "../ai/backgroundRelay";
import { LINKWISE_ANALYZE_JOB, LINKWISE_CANCEL_ANALYZE_JOB } from "../background/aiRelay";
import type { Criterion } from "../models/goal";
import type { JobAiFindings, JobPosting } from "./jobTypes";

export interface JobAnalysisRequestBody {
  job: Pick<JobPosting, "jobId" | "title" | "company" | "headerLines" | "description" | "companyText">;
  criteria: Pick<Criterion, "id" | "label" | "importance">[];
}

type JobApiResponse = { status: "job"; jobId: string; findings: JobAiFindings } | { status: "not_configured" } | { status: "unavailable"; reason: string } | { status: "invalid_request"; message: string };

export type JobAiOutcome = { status: "ok"; jobId: string; findings: JobAiFindings } | { status: "unavailable"; reason: string };

export type JobAnalysisRequester = (body: JobAnalysisRequestBody) => PendingRelayRequest<JobAiOutcome>;

export function requestJobAnalysis(payload: JobAnalysisRequestBody): PendingRelayRequest<JobAiOutcome> {
  return sendBackgroundRelayRequest<JobApiResponse, JobAiOutcome>({
    requestType: LINKWISE_ANALYZE_JOB,
    cancelType: LINKWISE_CANCEL_ANALYZE_JOB,
    idPrefix: "job_req",
    payload,
    toOutcome: (response) => (response.status === "job" ? { status: "ok", jobId: response.jobId, findings: response.findings } : { status: "unavailable", reason: response.status === "unavailable" ? response.reason : response.status }),
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
