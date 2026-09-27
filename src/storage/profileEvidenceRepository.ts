// Evidence lives in the profile's session, shared by the main page, its detail pages and reloads.
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { clearProfileSessions, loadProfileSession, updateProfileSession } from "./profileSessionRepository";

export async function saveProfileEvidence(profileKey: string, profile: LinkedInProfile): Promise<void> {
  await updateProfileSession(profileKey, { evidence: profile });
}

// EMPTY_PROFILE when there's no fresh session for exactly this profileKey.
export async function loadProfileEvidence(profileKey: string): Promise<LinkedInProfile> {
  return (await loadProfileSession(profileKey))?.evidence ?? { ...EMPTY_PROFILE };
}

export async function clearProfileEvidence(): Promise<void> {
  await clearProfileSessions();
}
