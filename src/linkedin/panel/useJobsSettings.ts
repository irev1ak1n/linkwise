import { useSyncExternalStore } from "react";
import { getJobsSettingsState, initJobsSettingsStore, setJobsSettings, subscribeJobsSettingsStore } from "./jobsSettingsStore";

export function useJobsSettings() {
  initJobsSettingsStore();
  const state = useSyncExternalStore(subscribeJobsSettingsStore, getJobsSettingsState);
  return { settings: state.settings, loaded: state.loaded, setJobsSettings };
}
