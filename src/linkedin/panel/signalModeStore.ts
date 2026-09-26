import { SIGNAL_MODE_STORAGE_KEY, loadSignalModePreference, saveSignalModePreference } from "../../storage/signalModeRepository";
import { isExtensionContextValid } from "../extensionContext";
import type { SignalAnalysisState } from "../../ai/signalAnalysisController";

export interface SignalModeState {
  enabled: boolean;
  loaded: boolean;
  analysis: SignalAnalysisState;
  highlighted: number;
}

type Listener = () => void;

let state: SignalModeState = { enabled: false, loaded: false, analysis: { status: "idle" }, highlighted: 0 };
const listeners = new Set<Listener>();

function setState(next: SignalModeState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getSignalModeState(): SignalModeState {
  return state;
}

export function subscribeSignalModeStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh(): Promise<void> {
  const enabled = await loadSignalModePreference();
  setState({ ...state, enabled, loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName === "local" && SIGNAL_MODE_STORAGE_KEY in changes) void refresh();
}

let initialized = false;

export function initSignalModeStore(): void {
  if (initialized) return;
  initialized = true;
  if (isExtensionContextValid()) chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

export function setSignalModeEnabled(enabled: boolean): void {
  setState({ ...state, enabled, loaded: true });
  void saveSignalModePreference(enabled);
}

export function publishSignalAnalysis(analysis: SignalAnalysisState, highlighted: number): void {
  if (analysis === state.analysis && highlighted === state.highlighted) return;
  setState({ ...state, analysis, highlighted });
}
