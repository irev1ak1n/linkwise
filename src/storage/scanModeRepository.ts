// Local-only persistence for the user's chosen profile-scanning mode, same pattern as
// goalsRepository.ts.
import { DEFAULT_SCAN_MODE, type ScanMode } from "../models/scanMode";

export type { ScanMode };
export const SCAN_MODE_STORAGE_KEY = "finder.scanMode.v1";

function isScanMode(value: unknown): value is ScanMode {
  return value === "scroll" || value === "auto";
}

export async function loadScanMode(): Promise<ScanMode> {
  const stored = await chrome.storage.local.get(SCAN_MODE_STORAGE_KEY);
  const value = stored[SCAN_MODE_STORAGE_KEY];
  return isScanMode(value) ? value : DEFAULT_SCAN_MODE;
}

export async function saveScanMode(mode: ScanMode): Promise<void> {
  await chrome.storage.local.set({ [SCAN_MODE_STORAGE_KEY]: mode });
}
