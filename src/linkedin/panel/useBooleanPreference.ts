import { useSyncExternalStore } from "react";
import type { BooleanPreferenceState, createBooleanPreference } from "./booleanPreference";

export function useBooleanPreference(preference: ReturnType<typeof createBooleanPreference>): BooleanPreferenceState {
  preference.init();
  return useSyncExternalStore(preference.subscribe, preference.getState);
}
