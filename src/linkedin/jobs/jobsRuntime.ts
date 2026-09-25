import type { JobsSettings } from "../../models/jobsSettings";
import { processJobCards, restoreAllJobCards } from "./jobsProcessor";

export function isJobsSearchPage(href: string): boolean {
  return /\/jobs\/(search|collections|search-results)\//.test(href);
}

let lastAppliedSettings: JobsSettings | null = null;

export function runJobsTick(href: string, settings: JobsSettings): void {
  if (!isJobsSearchPage(href)) return;

  if (lastAppliedSettings !== null && lastAppliedSettings !== settings) {
    restoreAllJobCards(document);
  }
  lastAppliedSettings = settings;
  processJobCards(document, settings);
}

export function resetJobsRuntime(): void {
  lastAppliedSettings = null;
}
