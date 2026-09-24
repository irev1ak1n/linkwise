// The bridge between the collection engine and the panel's React tree. Both live in the same
// JS realm, so this is a plain in-memory store, read via useSyncExternalStore.
import type { CollectionState } from "../../models/collection";
import type { LinkedInProfile } from "../../models/profile";

// Diagnostics for the Auto scan checklist, shown in ScanningView while a multi-page crawl runs.
export interface AutoScanProgress {
  sessionId: string;
  status: "scanning" | "complete";
  currentIndex: number;
  sections: { heading: string; url: string; status: string }[];
}

export interface PanelProfileData {
  profileKey: string | null;
  profile: LinkedInProfile | null;
  collection: CollectionState | null;
  autoScanProgress?: AutoScanProgress | null;
}

type Listener = () => void;

let data: PanelProfileData = { profileKey: null, profile: null, collection: null, autoScanProgress: null };
const listeners = new Set<Listener>();

export function getPanelProfileData(): PanelProfileData {
  return data;
}

export function setPanelProfileData(next: PanelProfileData): void {
  data = next;
  listeners.forEach((listener) => listener());
}

export function subscribePanelProfileData(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
