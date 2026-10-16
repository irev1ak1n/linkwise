// One record per saved person, keyed by the same canonical profile key as their session, so a
// person's main page and detail pages can never become separate saved profiles.
import type { SavedProfile, SnapshotRecord } from "../savedProfiles/types";
import { safeStorageGet, safeStorageGetAll, safeStorageRemove, safeStorageSet } from "./safeChromeStorage";

export const SAVED_PROFILE_KEY_PREFIX = "finder.savedProfile.v1:";
export const MAX_HISTORY = 8;

export function savedProfileStorageKey(profileKey: string): string {
  return `${SAVED_PROFILE_KEY_PREFIX}${profileKey}`;
}

function valid(value: unknown, profileKey?: string): value is SavedProfile {
  const profile = value as SavedProfile | undefined;
  return !!profile && typeof profile.profileKey === "string" && Array.isArray(profile.history) && profile.history.length > 0 && (!profileKey || profile.profileKey === profileKey);
}

export async function loadSavedProfile(profileKey: string): Promise<SavedProfile | null> {
  const key = savedProfileStorageKey(profileKey);
  const value = (await safeStorageGet(key))[key];
  return valid(value, profileKey) ? value : null;
}

export async function listSavedProfiles(): Promise<SavedProfile[]> {
  const all = await safeStorageGetAll();
  return Object.entries(all)
    .filter(([key, value]) => key.startsWith(SAVED_PROFILE_KEY_PREFIX) && valid(value, key.slice(SAVED_PROFILE_KEY_PREFIX.length)))
    .map(([, value]) => value as SavedProfile)
    .sort((a, b) => b.lastCheckedAt - a.lastCheckedAt);
}

let queue: Promise<unknown> = Promise.resolve();

// Read, change and write one saved profile at a time.
export function updateSavedProfile(profileKey: string, update: (current: SavedProfile | null) => SavedProfile | null): Promise<SavedProfile | null> {
  const run = queue.then(async () => {
    const current = await loadSavedProfile(profileKey);
    const next = update(current);
    if (!next || next === current) return current;
    await safeStorageSet({ [savedProfileStorageKey(profileKey)]: { ...next, history: next.history.slice(0, MAX_HISTORY) } });
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

export interface SaveProfileInput {
  profileKey: string;
  profileName: string;
  profileUrl: string;
  record: SnapshotRecord;
}

// Saving someone already saved keeps their existing record and history.
export function saveProfile(input: SaveProfileInput): Promise<SavedProfile | null> {
  return updateSavedProfile(input.profileKey, (current) =>
    current ?? {
      profileKey: input.profileKey,
      profileName: input.profileName,
      profileUrl: input.profileUrl,
      savedAt: input.record.recordedAt,
      lastCheckedAt: input.record.recordedAt,
      history: [input.record],
      lastCheck: null,
      notes: "",
    },
  );
}

export function setSavedProfileNotes(profileKey: string, notes: string): Promise<SavedProfile | null> {
  return updateSavedProfile(profileKey, (current) => (current && current.notes !== notes ? { ...current, notes } : current));
}

export async function deleteSavedProfile(profileKey: string): Promise<void> {
  await queue;
  await safeStorageRemove([savedProfileStorageKey(profileKey)]);
}
