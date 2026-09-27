import type { LinkedInProfile } from "../models/profile";
import { safeStorageGet, safeStorageSet } from "./safeChromeStorage";

export const PROFILE_SESSIONS_STORAGE_KEY = "finder.profileSessions.v1";
export const PROFILE_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 20;

export interface ProfileSession {
  profileKey: string;
  createdAt: number;
  updatedAt: number;
  evidence: LinkedInProfile;
  scannedSections: string[];
}

type SessionMap = Record<string, ProfileSession>;

// A fixed lifetime from creation, so browsing a profile never keeps its session alive forever.
export function isProfileSessionFresh(session: Pick<ProfileSession, "createdAt">, now: number): boolean {
  return now - session.createdAt < PROFILE_SESSION_TTL_MS;
}

async function readSessions(): Promise<SessionMap> {
  const value = (await safeStorageGet(PROFILE_SESSIONS_STORAGE_KEY))[PROFILE_SESSIONS_STORAGE_KEY];
  return value && typeof value === "object" ? (value as SessionMap) : {};
}

export async function loadProfileSession(profileKey: string, now = Date.now()): Promise<ProfileSession | null> {
  const session = (await readSessions())[profileKey];
  return session && session.profileKey === profileKey && isProfileSessionFresh(session, now) ? session : null;
}

export async function updateProfileSession(
  profileKey: string,
  update: { evidence?: LinkedInProfile; scannedSection?: string | null; startedAt?: number | null },
  now = Date.now(),
): Promise<ProfileSession | null> {
  const sessions = await readSessions();
  const existing = sessions[profileKey];
  const current = existing && isProfileSessionFresh(existing, now) ? existing : null;
  if (!current && !update.evidence) return null;
  const createdAt = current?.createdAt ?? update.startedAt ?? now;
  if (!isProfileSessionFresh({ createdAt }, now)) return null;

  const scanned = new Set(current?.scannedSections ?? []);
  if (update.scannedSection) scanned.add(update.scannedSection);
  const next: ProfileSession = {
    profileKey,
    createdAt,
    updatedAt: now,
    evidence: update.evidence ?? current!.evidence,
    scannedSections: [...scanned],
  };

  const kept = Object.values(sessions)
    .filter((s) => s.profileKey !== profileKey && isProfileSessionFresh(s, now))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS - 1);
  await safeStorageSet({ [PROFILE_SESSIONS_STORAGE_KEY]: Object.fromEntries([...kept, next].map((s) => [s.profileKey, s])) });
  return next;
}

export async function clearProfileSessions(): Promise<void> {
  await safeStorageSet({ [PROFILE_SESSIONS_STORAGE_KEY]: {} });
}
