import {
  DEFAULT_MANUAL_SECTIONS_PREFERENCE,
  MANUAL_SECTIONS_STORAGE_KEY,
  loadManualSectionsPreference,
  saveManualSectionsPreference,
} from "../../storage/manualSectionsPreferenceRepository";
import { isExtensionContextValid } from "../extensionContext";

export interface ManualSectionsState {
  enabled: boolean;
  loaded: boolean;
}

type Listener = () => void;

let state: ManualSectionsState = { enabled: DEFAULT_MANUAL_SECTIONS_PREFERENCE, loaded: false };
const listeners = new Set<Listener>();

function setState(next: ManualSectionsState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getManualSectionsState(): ManualSectionsState {
  return state;
}

export function subscribeManualSectionsStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh(): Promise<void> {
  setState({ enabled: await loadManualSectionsPreference(), loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName === "local" && MANUAL_SECTIONS_STORAGE_KEY in changes) void refresh();
}

let initialized = false;

export function initManualSectionsStore(): void {
  if (initialized) return;
  initialized = true;
  if (isExtensionContextValid()) chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

export function setManualSectionsPreference(enabled: boolean): void {
  setState({ enabled, loaded: true });
  void saveManualSectionsPreference(enabled);
}
