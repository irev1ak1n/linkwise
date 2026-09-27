import { safeStorageGet, safeStorageSet } from "../../storage/safeChromeStorage";
import { isExtensionContextValid } from "../extensionContext";

export interface StoredPreferenceState<T> {
  value: T;
  loaded: boolean;
}

// A single stored setting, shared by the panel and the content script.
export function createStoredPreference<T>(storageKey: string, defaultValue: T, parse: (stored: unknown) => T | undefined) {
  let state: StoredPreferenceState<T> = { value: defaultValue, loaded: false };
  const listeners = new Set<() => void>();
  let initialized = false;

  function setState(next: StoredPreferenceState<T>): void {
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function refresh(): Promise<void> {
    const stored = (await safeStorageGet(storageKey))[storageKey];
    setState({ value: parse(stored) ?? defaultValue, loaded: true });
  }

  return {
    getState: (): StoredPreferenceState<T> => state,
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
    set(value: T): void {
      setState({ value, loaded: true });
      void safeStorageSet({ [storageKey]: value });
    },
  };
}

export type StoredPreference<T> = ReturnType<typeof createStoredPreference<T>>;

export function createBooleanPreference(storageKey: string, defaultValue: boolean): StoredPreference<boolean> {
  return createStoredPreference(storageKey, defaultValue, (stored) => (typeof stored === "boolean" ? stored : undefined));
}
