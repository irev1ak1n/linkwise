import { safeStorageGet, safeStorageSet } from "../../storage/safeChromeStorage";
import { isExtensionContextValid } from "../extensionContext";

export interface BooleanPreferenceState {
  enabled: boolean;
  loaded: boolean;
}

export function createBooleanPreference(storageKey: string, defaultValue: boolean) {
  let state: BooleanPreferenceState = { enabled: defaultValue, loaded: false };
  const listeners = new Set<() => void>();
  let initialized = false;

  function setState(next: BooleanPreferenceState): void {
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function refresh(): Promise<void> {
    const value = (await safeStorageGet(storageKey))[storageKey];
    setState({ enabled: typeof value === "boolean" ? value : defaultValue, loaded: true });
  }

  const preference = {
    getState: (): BooleanPreferenceState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    init(): void {
      if (initialized) return;
      initialized = true;
      if (isExtensionContextValid()) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === "local" && storageKey in changes) void refresh();
        });
      }
      void refresh();
    },
    set(enabled: boolean): void {
      setState({ enabled, loaded: true });
      void safeStorageSet({ [storageKey]: enabled });
    },
  };
  return preference;
}
