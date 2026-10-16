// Every saved profile, kept in memory for the panel and refreshed whenever storage changes, so a
// save or check from any tab shows up everywhere.
import { useEffect, useSyncExternalStore } from "react";
import { isExtensionContextValid } from "../linkedin/extensionContext";
import { SAVED_PROFILE_KEY_PREFIX, listSavedProfiles } from "../storage/savedProfilesRepository";
import type { SavedProfile } from "./types";

interface State {
  loaded: boolean;
  list: SavedProfile[];
}

let state: State = { loaded: false, list: [] };
const listeners = new Set<() => void>();
let watching = false;
let generation = 0;

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function refreshSavedProfiles(): Promise<void> {
  const mine = ++generation;
  return listSavedProfiles()
    .then((list) => {
      if (mine !== generation) return;
      state = { loaded: true, list };
      notify();
    })
    .catch(() => {});
}

function watch(): void {
  if (watching || !isExtensionContextValid()) return;
  watching = true;
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && Object.keys(changes).some((key) => key.startsWith(SAVED_PROFILE_KEY_PREFIX))) void refreshSavedProfiles();
  });
  void refreshSavedProfiles();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;

export function useSavedProfiles(): State {
  useEffect(watch, []);
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useSavedProfile(profileKey: string | null): { loaded: boolean; saved: SavedProfile | null } {
  const { loaded, list } = useSavedProfiles();
  return { loaded, saved: (profileKey && list.find((profile) => profile.profileKey === profileKey)) || null };
}

/** Test-only. */
export function resetSavedProfilesStore(): void {
  state = { loaded: false, list: [] };
  watching = false;
  generation++;
}
