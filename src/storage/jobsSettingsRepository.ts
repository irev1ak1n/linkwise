import { DEFAULT_JOBS_SETTINGS, type JobCardAction, type JobsSettings } from "../models/jobsSettings";

export const JOBS_SETTINGS_STORAGE_KEY = "finder.jobsSettings.v1";

function isJobCardAction(value: unknown): value is JobCardAction {
  return value === "none" || value === "hide" || value === "highlight";
}

function isJobsSettings(value: unknown): value is Partial<JobsSettings> {
  return typeof value === "object" && value !== null;
}

export async function loadJobsSettings(): Promise<JobsSettings> {
  const stored = await chrome.storage.local.get(JOBS_SETTINGS_STORAGE_KEY);
  const value = stored[JOBS_SETTINGS_STORAGE_KEY];
  if (!isJobsSettings(value)) return DEFAULT_JOBS_SETTINGS;

  return {
    appliedAction: isJobCardAction(value.appliedAction) ? value.appliedAction : DEFAULT_JOBS_SETTINGS.appliedAction,
    keywordsText: typeof value.keywordsText === "string" ? value.keywordsText : DEFAULT_JOBS_SETTINGS.keywordsText,
    keywordAction: isJobCardAction(value.keywordAction) ? value.keywordAction : DEFAULT_JOBS_SETTINGS.keywordAction,
    caseInsensitive: typeof value.caseInsensitive === "boolean" ? value.caseInsensitive : DEFAULT_JOBS_SETTINGS.caseInsensitive,
  };
}

export async function saveJobsSettings(settings: JobsSettings): Promise<void> {
  await chrome.storage.local.set({ [JOBS_SETTINGS_STORAGE_KEY]: settings });
}
