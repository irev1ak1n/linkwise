import { safeStorageGet, safeStorageSet } from "./safeChromeStorage";

export const SIGNAL_MODE_STORAGE_KEY = "finder.signalMode.v1";

export async function loadSignalModePreference(): Promise<boolean> {
  const stored = await safeStorageGet(SIGNAL_MODE_STORAGE_KEY);
  return stored[SIGNAL_MODE_STORAGE_KEY] === true;
}

export async function saveSignalModePreference(enabled: boolean): Promise<void> {
  await safeStorageSet({ [SIGNAL_MODE_STORAGE_KEY]: enabled });
}
