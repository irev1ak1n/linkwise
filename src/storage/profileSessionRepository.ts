import type { LinkedInProfile } from "../models/profile";
import { sameEvidence } from "../linkedin/profileEvidenceAccumulator";
import { safeStorageGet, safeStorageSet } from "./safeChromeStorage";

export const PROFILE_SESSIONS_STORAGE_KEY = "finder.profileSessions.v2";
export const PROFILE_SESSION_FRESH_MS = 10 * 60 * 1000;
export const PROFILE_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 20;

export interface ProfileSession {
  profileKey: string;
  createdAt: number;
  lastValidatedAt: number;
  lastEvidenceChangeAt: number;
  evidence: LinkedInProfile;
  scannedSections: string[];
}

type SessionMap = Record<string, ProfileSession>;

// Stale sessions are still shown, then checked against the page again.
export function isProfileSessionFresh(session: Pick<ProfileSession, "lastValidatedAt">, now: number): boolean {
  return now - session.lastValidatedAt < PROFILE_SESSION_FRESH_MS;
}

function isRetained(session: ProfileSession, now: number): boolean {
  return typeof session.lastValidatedAt === "number" && now - session.lastValidatedAt < PROFILE_SESSION_RETENTION_MS;
}

async function readSessions(): Promise<SessionMap> {
  const value = (await safeStorageGet(PROFILE_SESSIONS_STORAGE_KEY))[PROFILE_SESSIONS_STORAGE_KEY];
  return value && typeof value === "object" ? (value as SessionMap) : {};
}

export async function loadProfileSession(profileKey: string, now = Date.now()): Promise<ProfileSession | null> {
  const session = (await readSessions())[profileKey];
  return session && session.profileKey === profileKey && isRetained(session, now) ? session : null;
}

// Freshness moves only when the page's evidence was actually checked, or changed.
export async function updateProfileSession(
  profileKey: string,
  update: { evidence?: LinkedInProfile; scannedSection?: string | null; validated?: boolean },
  now = Date.now(),
): Promise<ProfileSession | null> {
  const sessions = await readSessions();
  const existing = sessions[profileKey];
  const current = existing && isRetained(existing, now) ? existing : null;
  if (!current && !update.evidence) return null;

  const evidence = update.evidence ?? current!.evidence;
  const evidenceChanged = !current || !sameEvidence(evidence, current.evidence);
  const sections = current?.scannedSections ?? [];
  const newSection = !!update.scannedSection && !sections.includes(update.scannedSection);
  if (current && !evidenceChanged && !newSection && !update.validated) return current;

  const next: ProfileSession = {
    profileKey,
    createdAt: current?.createdAt ?? now,
    lastValidatedAt: evidenceChanged || update.validated ? now : current!.lastValidatedAt,
    lastEvidenceChangeAt: evidenceChanged ? now : current!.lastEvidenceChangeAt,
    evidence,
    scannedSections: newSection ? [...sections, update.scannedSection!] : sections,
  };

  const kept = Object.values(sessions)
    .filter((s) => s.profileKey !== profileKey && isRetained(s, now))
    .sort((a, b) => b.lastValidatedAt - a.lastValidatedAt)
    .slice(0, MAX_SESSIONS - 1);
  await safeStorageSet({ [PROFILE_SESSIONS_STORAGE_KEY]: Object.fromEntries([...kept, next].map((s) => [s.profileKey, s])) });
  return next;
}

export async function clearProfileSessions(): Promise<void> {
  await safeStorageSet({ [PROFILE_SESSIONS_STORAGE_KEY]: {} });
}
