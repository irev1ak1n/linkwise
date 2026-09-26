import { safeStorageGet, safeStorageSet } from "./safeChromeStorage";

export const MANUAL_SECTIONS_STORAGE_KEY = "finder.analyzeOpenedSections.v1";
export const DEFAULT_MANUAL_SECTIONS_PREFERENCE = true;

export async function loadManualSectionsPreference(): Promise<boolean> {
  const value = (await safeStorageGet(MANUAL_SECTIONS_STORAGE_KEY))[MANUAL_SECTIONS_STORAGE_KEY];
  return typeof value === "boolean" ? value : DEFAULT_MANUAL_SECTIONS_PREFERENCE;
}

export async function saveManualSectionsPreference(enabled: boolean): Promise<void> {
  await safeStorageSet({ [MANUAL_SECTIONS_STORAGE_KEY]: enabled });
}
