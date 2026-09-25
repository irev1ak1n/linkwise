import { DEFAULT_JOBS_SETTINGS, type JobsSettings } from "../../models/jobsSettings";
import { JOBS_SETTINGS_STORAGE_KEY, loadJobsSettings, saveJobsSettings } from "../../storage/jobsSettingsRepository";

export interface JobsSettingsState {
  settings: JobsSettings;
  loaded: boolean;
}

type Listener = () => void;

let state: JobsSettingsState = { settings: DEFAULT_JOBS_SETTINGS, loaded: false };
const listeners = new Set<Listener>();

function setState(next: JobsSettingsState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getJobsSettingsState(): JobsSettingsState {
  return state;
}

export function subscribeJobsSettingsStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let writeGeneration = 0;

// A storage-change echo of our own recent write can resolve after a newer keystroke, otherwise
// overwriting it with stale text mid-typing.
async function refresh(): Promise<void> {
  const generationAtStart = writeGeneration;
  const settings = await loadJobsSettings();
  if (writeGeneration !== generationAtStart) return;
  setState({ settings, loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== "local") return;
  if (JOBS_SETTINGS_STORAGE_KEY in changes) void refresh();
}

let initialized = false;

export function initJobsSettingsStore(): void {
  if (initialized) return;
  initialized = true;
  chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

export function setJobsSettings(settings: JobsSettings): void {
  writeGeneration++;
  setState({ settings, loaded: true });
  void saveJobsSettings(settings);
}
