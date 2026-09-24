// Local-only persistence for the "Expand profile details automatically" checkbox, same pattern
// as scanModeRepository.ts. Only meaningful in "Analyze as I scroll" mode, Auto scan always
// expands safe profile details regardless of this preference.
export const EXPAND_DETAILS_STORAGE_KEY = "finder.expandDetailsAutomatically.v1";
export const DEFAULT_EXPAND_DETAILS_PREFERENCE = false;

export async function loadExpandDetailsPreference(): Promise<boolean> {
  const stored = await chrome.storage.local.get(EXPAND_DETAILS_STORAGE_KEY);
  const value = stored[EXPAND_DETAILS_STORAGE_KEY];
  return typeof value === "boolean" ? value : DEFAULT_EXPAND_DETAILS_PREFERENCE;
}

export async function saveExpandDetailsPreference(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [EXPAND_DETAILS_STORAGE_KEY]: value });
}
