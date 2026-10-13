// Local-only persistence for the user's chosen profile-scanning mode, same pattern as
// goalsRepository.ts.
import { DEFAULT_SCAN_MODE, type ScanMode } from "../models/scanMode";
import { safeStorageGet, safeStorageRemove, safeStorageSet } from "./safeChromeStorage";

export type { ScanMode };
export const SCAN_MODE_STORAGE_KEY = "finder.scanMode.v1";
// The removed Auto scroll mode and its speed setting. Its users move to Auto scan, the closest
// remaining hands-free mode.
const REMOVED_AUTO_SCROLL_MODE = "autoScroll";
const REMOVED_AUTO_SCROLL_SPEED_KEY = "finder.autoScrollSpeed.v1";

function isScanMode(value: unknown): value is ScanMode {
  return value === "scroll" || value === "auto";
}

export async function loadScanMode(): Promise<ScanMode> {
  const stored = await safeStorageGet([SCAN_MODE_STORAGE_KEY, REMOVED_AUTO_SCROLL_SPEED_KEY]);
  const value = stored[SCAN_MODE_STORAGE_KEY];
  if (REMOVED_AUTO_SCROLL_SPEED_KEY in stored) await safeStorageRemove(REMOVED_AUTO_SCROLL_SPEED_KEY);
  if (value === REMOVED_AUTO_SCROLL_MODE) {
    await saveScanMode("auto");
    return "auto";
  }
  return isScanMode(value) ? value : DEFAULT_SCAN_MODE;
}

export async function saveScanMode(mode: ScanMode): Promise<void> {
  await safeStorageSet({ [SCAN_MODE_STORAGE_KEY]: mode });
}
