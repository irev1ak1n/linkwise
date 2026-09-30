import { createStoredPreference } from "./storedPreference";
import { DEFAULT_HIGHLIGHT_COLOR, toHighlightColor, type HighlightColor } from "../highlightPalette";

export const HIGHLIGHT_COLOR_STORAGE_KEY = "finder.signalHighlightColor.v1";

export const highlightColorPreference = createStoredPreference<HighlightColor>(HIGHLIGHT_COLOR_STORAGE_KEY, DEFAULT_HIGHLIGHT_COLOR, toHighlightColor);
