import type { JobCardAction } from "../../models/jobsSettings";

const stateByJobId = new Map<string, JobCardAction>();

export function getTrackedState(jobId: string): JobCardAction {
  return stateByJobId.get(jobId) ?? "none";
}

export function setTrackedState(jobId: string, state: JobCardAction): void {
  stateByJobId.set(jobId, state);
}

export function clearTrackedStates(): void {
  stateByJobId.clear();
}
