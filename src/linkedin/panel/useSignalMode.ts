import { useSyncExternalStore } from "react";
import { getSignalModeState, initSignalModeStore, setSignalModeEnabled, subscribeSignalModeStore } from "./signalModeStore";

export function useSignalMode() {
  initSignalModeStore();
  const state = useSyncExternalStore(subscribeSignalModeStore, getSignalModeState);
  return { ...state, setSignalModeEnabled };
}
