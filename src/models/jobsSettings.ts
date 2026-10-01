import { DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from "../linkedin/highlightPalette";

export type JobCardAction = "none" | "hide" | "highlight";

export interface JobsSettings {
  appliedAction: JobCardAction;
  viewedAction: JobCardAction;
  savedAction: JobCardAction;
  keywordsText: string;
  keywordAction: JobCardAction;
  caseInsensitive: boolean;
  appliedColor: HighlightColor;
  viewedColor: HighlightColor;
  savedColor: HighlightColor;
  keywordColor: HighlightColor;
}

export const DEFAULT_JOBS_SETTINGS: JobsSettings = {
  appliedAction: "none",
  viewedAction: "none",
  savedAction: "none",
  keywordsText: "",
  keywordAction: "none",
  caseInsensitive: true,
  appliedColor: DEFAULT_HIGHLIGHT_COLOR,
  viewedColor: DEFAULT_HIGHLIGHT_COLOR,
  savedColor: DEFAULT_HIGHLIGHT_COLOR,
  keywordColor: DEFAULT_HIGHLIGHT_COLOR,
};
