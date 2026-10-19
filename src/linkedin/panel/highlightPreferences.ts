import { safeStorageGet, safeStorageSet } from "../../storage/safeChromeStorage";
import { isExtensionContextValid } from "../extensionContext";
import {
  DEFAULT_HIGHLIGHT_PREFERENCES,
  migrateLegacyColors,
  parseHighlightPreferences,
  type HighlightCategory,
  type HighlightPreferences,
  type HighlightStyle,
} from "../../signals/highlightCategories";
import type { StoredPreferenceState } from "./storedPreference";

export const HIGHLIGHT_PREFERENCES_STORAGE_KEY = "finder.highlightPreferences.v1";
// Before categories: one color for every Signal highlight, one for keywords. Read only until the
// first change is saved under the new key, then never again.
export const LEGACY_SIGNAL_COLOR_KEY = "finder.signalHighlightColor.v1";
export const LEGACY_KEYWORD_COLOR_KEY = "finder.keywordHighlightColor.v1";
const WATCHED = [HIGHLIGHT_PREFERENCES_STORAGE_KEY, LEGACY_SIGNAL_COLOR_KEY, LEGACY_KEYWORD_COLOR_KEY];

let state: StoredPreferenceState<HighlightPreferences> = { value: DEFAULT_HIGHLIGHT_PREFERENCES, loaded: false };
const listeners = new Set<() => void>();
let initialized = false;

function setState(next: StoredPreferenceState<HighlightPreferences>): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function readHighlightPreferences(stored: Record<string, unknown>): HighlightPreferences {
  const saved = stored[HIGHLIGHT_PREFERENCES_STORAGE_KEY];
  return saved !== undefined ? parseHighlightPreferences(saved) : migrateLegacyColors(stored[LEGACY_SIGNAL_COLOR_KEY], stored[LEGACY_KEYWORD_COLOR_KEY]);
}

async function refresh(): Promise<void> {
  setState({ value: readHighlightPreferences(await safeStorageGet(WATCHED)), loaded: true });
}

function save(value: HighlightPreferences): void {
  setState({ value, loaded: true });
  void safeStorageSet({ [HIGHLIGHT_PREFERENCES_STORAGE_KEY]: value });
}

// Shared by the panel and the content script, like every other stored setting.
export const highlightPreferences = {
  getState: (): StoredPreferenceState<HighlightPreferences> => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  init(): void {
    if (initialized) return;
    initialized = true;
    if (isExtensionContextValid()) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && WATCHED.some((key) => key in changes)) void refresh();
      });
    }
    void refresh();
  },
  set: save,
  setCategory(category: HighlightCategory, patch: Partial<HighlightStyle>): void {
    const current = state.value;
    save({ ...current, categories: { ...current.categories, [category]: { ...current.categories[category], ...patch } } });
  },
  setKeywords(patch: Partial<HighlightStyle>): void {
    save({ ...state.value, keywords: { ...state.value.keywords, ...patch } });
  },
};

export function resetHighlightPreferencesForTests(): void {
  state = { value: DEFAULT_HIGHLIGHT_PREFERENCES, loaded: false };
  listeners.clear();
  initialized = false;
}
