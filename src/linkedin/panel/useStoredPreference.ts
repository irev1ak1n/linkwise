import { useSyncExternalStore } from "react";
import type { StoredPreference, StoredPreferenceState } from "./storedPreference";

export function useStoredPreference<T>(preference: StoredPreference<T>): StoredPreferenceState<T> {
  preference.init();
  return useSyncExternalStore(preference.subscribe, preference.getState);
}
