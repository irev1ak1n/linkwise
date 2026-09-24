import { useSyncExternalStore } from "react";
import {
  getExpandDetailsState,
  initExpandDetailsStore,
  setExpandDetailsPreference,
  subscribeExpandDetailsStore,
} from "./expandDetailsStore";

export function useExpandDetailsPreference() {
  initExpandDetailsStore();
  const state = useSyncExternalStore(subscribeExpandDetailsStore, getExpandDetailsState);
  return { enabled: state.enabled, loaded: state.loaded, setExpandDetailsPreference };
}
