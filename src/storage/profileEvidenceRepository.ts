// Persists the accumulated profile evidence across a multi-page Auto scan, so a page reload
// or navigation between "/details/{section}/" pages never loses what's already been collected.
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";

const STORAGE_KEY = "finder.profileEvidence.v1";

interface StoredEvidence {
  profileKey: string;
  profile: LinkedInProfile;
}

export async function saveProfileEvidence(profileKey: string, profile: LinkedInProfile): Promise<void> {
  const entry: StoredEvidence = { profileKey, profile };
  await chrome.storage.local.set({ [STORAGE_KEY]: entry });
}

// EMPTY_PROFILE when there's nothing yet, or it belongs to a different person than profileKey.
export async function loadProfileEvidence(profileKey: string): Promise<LinkedInProfile> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const entry = stored[STORAGE_KEY] as StoredEvidence | undefined;
  if (!entry || entry.profileKey !== profileKey) return { ...EMPTY_PROFILE };
  return entry.profile;
}

export async function clearProfileEvidence(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
