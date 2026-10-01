import { createStoredPreference } from "./storedPreference";
import { DEFAULT_KEYWORD_HIGHLIGHT_COLOR, toHighlightColor, type HighlightColor } from "../highlightPalette";

export const KEYWORD_COLOR_STORAGE_KEY = "finder.keywordHighlightColor.v1";

export const keywordColorPreference = createStoredPreference<HighlightColor>(KEYWORD_COLOR_STORAGE_KEY, DEFAULT_KEYWORD_HIGHLIGHT_COLOR, toHighlightColor);
