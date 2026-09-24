// The "Enhanced analysis" checkbox state, same external-store pattern as expandDetailsStore.ts.
// Read synchronously by content.ts on every tick, and by the panel's checkbox.
import {
  DEFAULT_ENHANCED_ANALYSIS_PREFERENCE,
  ENHANCED_ANALYSIS_STORAGE_KEY,
  loadEnhancedAnalysisPreference,
  saveEnhancedAnalysisPreference,
} from "../../storage/enhancedAnalysisPreferenceRepository";

export interface EnhancedAnalysisState {
  enabled: boolean;
  loaded: boolean;
}

type Listener = () => void;

let state: EnhancedAnalysisState = { enabled: DEFAULT_ENHANCED_ANALYSIS_PREFERENCE, loaded: false };
const listeners = new Set<Listener>();

function setState(next: EnhancedAnalysisState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getEnhancedAnalysisState(): EnhancedAnalysisState {
  return state;
}

export function subscribeEnhancedAnalysisStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh(): Promise<void> {
  const enabled = await loadEnhancedAnalysisPreference();
  setState({ enabled, loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== "local") return;
  if (ENHANCED_ANALYSIS_STORAGE_KEY in changes) void refresh();
}

let initialized = false;

// Idempotent, safe to call from every render. Starts the storage listener and first read once.
export function initEnhancedAnalysisStore(): void {
  if (initialized) return;
  initialized = true;
  chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

export function setEnhancedAnalysisPreference(enabled: boolean): void {
  setState({ enabled, loaded: true });
  void saveEnhancedAnalysisPreference(enabled);
}
