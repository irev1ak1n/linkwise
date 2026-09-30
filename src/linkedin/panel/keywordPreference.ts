import { createStoredPreference } from "./storedPreference";

export const HIGHLIGHT_KEYWORDS_STORAGE_KEY = "finder.highlightKeywords.v1";

// Kept as typed, so the input shows the user's own separators and line breaks.
export const highlightKeywordsPreference = createStoredPreference<string>(HIGHLIGHT_KEYWORDS_STORAGE_KEY, "", (stored) =>
  typeof stored === "string" ? stored : undefined,
);
