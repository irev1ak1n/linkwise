// The user's chosen profile-scanning mode, same external-store pattern as goalStore.ts.
// Read synchronously by content.ts on every tick, and by the panel's toggle UI.
import { DEFAULT_SCAN_MODE, type ScanMode } from "../../models/scanMode";
import { SCAN_MODE_STORAGE_KEY, loadScanMode, saveScanMode } from "../../storage/scanModeRepository";
import { isExtensionContextValid } from "../extensionContext";

export type { ScanMode };

export interface ScanModeState {
  mode: ScanMode;
  loaded: boolean;
}

type Listener = () => void;

let state: ScanModeState = { mode: DEFAULT_SCAN_MODE, loaded: false };
const listeners = new Set<Listener>();

function setState(next: ScanModeState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getScanModeState(): ScanModeState {
  return state;
}

export function subscribeScanModeStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh(): Promise<void> {
  const mode = await loadScanMode();
  setState({ mode, loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== "local") return;
  if (SCAN_MODE_STORAGE_KEY in changes) void refresh();
}

let initialized = false;

// Idempotent, safe to call from every render. Starts the storage listener and first read once.
// A stale content script (extension already reloaded/updated) has no listener to register or
// anything real to read, refresh() just resolves to a safe default in that case.
export function initScanModeStore(): void {
  if (initialized) return;
  initialized = true;
  if (isExtensionContextValid()) chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

export function setScanMode(mode: ScanMode): void {
  setState({ mode, loaded: true });
  void saveScanMode(mode);
}
