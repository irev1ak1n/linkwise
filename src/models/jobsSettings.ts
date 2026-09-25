export type JobCardAction = "none" | "hide" | "highlight";

export interface JobsSettings {
  appliedAction: JobCardAction;
  viewedAction: JobCardAction;
  savedAction: JobCardAction;
  keywordsText: string;
  keywordAction: JobCardAction;
  caseInsensitive: boolean;
}

export const DEFAULT_JOBS_SETTINGS: JobsSettings = {
  appliedAction: "none",
  viewedAction: "none",
  savedAction: "none",
  keywordsText: "",
  keywordAction: "none",
  caseInsensitive: true,
};
