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
import { createStoredPreference, type StoredPreferenceState } from "./storedPreference";
import { normalizeHex } from "../highlightColor";

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

// Dragging in the color editor changes the color many times a second: every change is shown at
// once, and storage gets the value the drag settles on.
const LIVE_WRITE_DELAY_MS = 250;
let pendingWrite: ReturnType<typeof setTimeout> | null = null;

async function refresh(): Promise<void> {
  const value = readHighlightPreferences(await safeStorageGet(WATCHED));
  // A change not yet written is newer than anything storage holds.
  if (pendingWrite) return;
  setState({ value, loaded: true });
}

function write(): void {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = null;
  void safeStorageSet({ [HIGHLIGHT_PREFERENCES_STORAGE_KEY]: state.value });
}

function save(value: HighlightPreferences, live = false): void {
  setState({ value, loaded: true });
  if (!live) return write();
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(write, LIVE_WRITE_DELAY_MS);
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
  set: (value: HighlightPreferences) => save(value),
  /** `live` is for a change still in progress (a drag): shown now, stored when it settles. */
  setCategory(category: HighlightCategory, patch: Partial<HighlightStyle>, live = false): void {
    const current = state.value;
    save({ ...current, categories: { ...current.categories, [category]: withPatch(current.categories[category], patch) } }, live);
  },
  setKeywords(patch: Partial<HighlightStyle>, live = false): void {
    save({ ...state.value, keywords: withPatch(state.value.keywords, patch) }, live);
  },
};

// Picking a preset swatch drops any custom color, so the preset is what shows.
function withPatch(style: HighlightStyle, patch: Partial<HighlightStyle>): HighlightStyle {
  const next = { ...style, ...patch };
  if ("custom" in patch && !patch.custom) delete next.custom;
  return next;
}

export const RECENT_COLORS_STORAGE_KEY = "finder.highlightRecentColors.v1";
export const MAX_RECENT_COLORS = 8;

/** Colors picked in the color editor, newest first, shared by every category. */
export const recentHighlightColors = createStoredPreference<string[]>(RECENT_COLORS_STORAGE_KEY, [], (stored) =>
  Array.isArray(stored) ? [...new Set(stored.map((c) => (typeof c === "string" ? normalizeHex(c) : null)).filter((c): c is string => c !== null))].slice(0, MAX_RECENT_COLORS) : undefined,
);

export function rememberRecentColor(hex: string): void {
  const color = normalizeHex(hex);
  if (!color) return;
  const current = recentHighlightColors.getState().value;
  if (current[0] === color) return;
  recentHighlightColors.set([color, ...current.filter((c) => c !== color)].slice(0, MAX_RECENT_COLORS));
}

export function resetHighlightPreferencesForTests(): void {
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = null;
  state = { value: DEFAULT_HIGHLIGHT_PREFERENCES, loaded: false };
  listeners.clear();
  initialized = false;
}
