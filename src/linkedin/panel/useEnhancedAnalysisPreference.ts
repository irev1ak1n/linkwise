import { useSyncExternalStore } from "react";
import {
  getEnhancedAnalysisState,
  initEnhancedAnalysisStore,
  setEnhancedAnalysisPreference,
  subscribeEnhancedAnalysisStore,
} from "./enhancedAnalysisStore";

export function useEnhancedAnalysisPreference() {
  initEnhancedAnalysisStore();
  const state = useSyncExternalStore(subscribeEnhancedAnalysisStore, getEnhancedAnalysisState);
  return { enabled: state.enabled, loaded: state.loaded, setEnhancedAnalysisPreference };
}
