// The "Expand profile details automatically" checkbox state, same external-store pattern as
// scanModeStore.ts. Read synchronously by content.ts on every tick, and by the panel's checkbox.
import {
  DEFAULT_EXPAND_DETAILS_PREFERENCE,
  EXPAND_DETAILS_STORAGE_KEY,
  loadExpandDetailsPreference,
  saveExpandDetailsPreference,
} from "../../storage/expandDetailsPreferenceRepository";
import { isExtensionContextValid } from "../extensionContext";

export interface ExpandDetailsState {
  enabled: boolean;
  loaded: boolean;
}

type Listener = () => void;

let state: ExpandDetailsState = { enabled: DEFAULT_EXPAND_DETAILS_PREFERENCE, loaded: false };
const listeners = new Set<Listener>();

function setState(next: ExpandDetailsState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getExpandDetailsState(): ExpandDetailsState {
  return state;
}

export function subscribeExpandDetailsStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh(): Promise<void> {
  const enabled = await loadExpandDetailsPreference();
  setState({ enabled, loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== "local") return;
  if (EXPAND_DETAILS_STORAGE_KEY in changes) void refresh();
}

let initialized = false;

// Idempotent, safe to call from every render. Starts the storage listener and first read once.
// A stale content script (extension already reloaded/updated) has no listener to register or
// anything real to read, refresh() just resolves to the default in that case.
export function initExpandDetailsStore(): void {
  if (initialized) return;
  initialized = true;
  if (isExtensionContextValid()) chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

export function setExpandDetailsPreference(enabled: boolean): void {
  setState({ enabled, loaded: true });
  void saveExpandDetailsPreference(enabled);
}
