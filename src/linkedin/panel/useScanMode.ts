import { useSyncExternalStore } from "react";
import { getScanModeState, initScanModeStore, setScanMode, subscribeScanModeStore } from "./scanModeStore";

export function useScanMode() {
  initScanModeStore();
  const state = useSyncExternalStore(subscribeScanModeStore, getScanModeState);
  return { mode: state.mode, loaded: state.loaded, setScanMode };
}
