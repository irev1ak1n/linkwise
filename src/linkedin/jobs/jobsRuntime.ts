import type { JobsSettings } from "../../models/jobsSettings";
import { processJobCards } from "./jobsProcessor";
import { clearTrackedStates } from "./jobCardStateTracker";

export function isJobsSearchPage(href: string): boolean {
  return /\/jobs\/(search|collections|search-results)\//.test(href);
}

export function runJobsTick(href: string, settings: JobsSettings): void {
  if (!isJobsSearchPage(href)) return;
  processJobCards(document, settings);
}

export function resetJobsRuntime(): void {
  clearTrackedStates();
}
