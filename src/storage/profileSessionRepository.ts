// One session per person, shared by every page, tab and reload. Evidence merges in, except a
// section read completely, which replaces what the session held for it.
import type { LinkedInProfile, ProfileSectionName } from "../models/profile";
import { mergeProfileEvidence, reconcileSections, sameEvidence } from "../linkedin/profileEvidenceAccumulator";
import { safeStorageGet, safeStorageGetAll, safeStorageRemove, safeStorageSet } from "./safeChromeStorage";

export const PROFILE_SESSION_KEY_PREFIX = "finder.profileSession.v3:";
// The older single map of every session, still read so existing sessions carry over.
export const LEGACY_PROFILE_SESSIONS_STORAGE_KEY = "finder.profileSessions.v2";
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
  /** Sections the main page shows only part of, behind a "Show all" link. */
  truncatedSections?: string[];
}

export function profileSessionStorageKey(profileKey: string): string {
  return `${PROFILE_SESSION_KEY_PREFIX}${profileKey}`;
}

// Stale sessions are still shown, then checked against the page again.
export function isProfileSessionFresh(session: Pick<ProfileSession, "lastValidatedAt">, now: number): boolean {
  return now - session.lastValidatedAt < PROFILE_SESSION_FRESH_MS;
}

function isRetained(session: ProfileSession | undefined, now: number): session is ProfileSession {
  return !!session && typeof session.lastValidatedAt === "number" && now - session.lastValidatedAt < PROFILE_SESSION_RETENTION_MS;
}

async function readSession(profileKey: string): Promise<ProfileSession | undefined> {
  const key = profileSessionStorageKey(profileKey);
  const stored = await safeStorageGet([key, LEGACY_PROFILE_SESSIONS_STORAGE_KEY]);
  const own = stored[key] as ProfileSession | undefined;
  const legacy = (stored[LEGACY_PROFILE_SESSIONS_STORAGE_KEY] as Record<string, ProfileSession> | undefined)?.[profileKey];
  const session = own ?? legacy;
  return session && session.profileKey === profileKey ? session : undefined;
}

export async function loadProfileSession(profileKey: string, now = Date.now()): Promise<ProfileSession | null> {
  const session = await readSession(profileKey);
  return isRetained(session, now) ? session : null;
}

type SessionUpdate = {
  evidence?: LinkedInProfile;
  /** Sections the evidence read completely, so they replace the stored ones. */
  completeSections?: readonly ProfileSectionName[];
  scannedSection?: string | null;
  validated?: boolean;
  truncatedSections?: string[];
};

// Updates in one tab run one at a time, so an update that read storage earlier can never write
// older evidence back over a newer one.
let queue: Promise<unknown> = Promise.resolve();

export function updateProfileSession(profileKey: string, update: SessionUpdate, now = Date.now()): Promise<ProfileSession | null> {
  const run = queue.then(() => applySessionUpdate(profileKey, update, now));
  queue = run.catch(() => {});
  return run;
}

// Freshness moves only when the page's evidence was actually checked, or changed.
async function applySessionUpdate(profileKey: string, update: SessionUpdate, now: number): Promise<ProfileSession | null> {
  const stored = await readSession(profileKey);
  const current = isRetained(stored, now) ? stored : null;
  if (!current && !update.evidence) return null;

  const evidence = update.evidence ? (current ? reconcileSections(mergeProfileEvidence(update.evidence, current.evidence), update.evidence, update.completeSections ?? []) : update.evidence) : current!.evidence;
  const evidenceChanged = !current || !sameEvidence(evidence, current.evidence);
  const sections = current?.scannedSections ?? [];
  const newSection = !!update.scannedSection && !sections.includes(update.scannedSection);
  const truncatedSections = update.truncatedSections ?? current?.truncatedSections;
  const truncationChanged = (truncatedSections ?? []).join() !== (current?.truncatedSections ?? []).join();
  if (current && !evidenceChanged && !newSection && !truncationChanged && !update.validated) return current;

  const next: ProfileSession = {
    profileKey,
    createdAt: current?.createdAt ?? now,
    lastValidatedAt: evidenceChanged || update.validated ? now : current!.lastValidatedAt,
    lastEvidenceChangeAt: evidenceChanged ? now : current!.lastEvidenceChangeAt,
    evidence,
    scannedSections: newSection ? [...sections, update.scannedSection!] : sections,
    ...(truncatedSections ? { truncatedSections } : {}),
  };
  await safeStorageSet({ [profileSessionStorageKey(profileKey)]: next });
  if (!current) await pruneSessions(profileKey, now);
  return next;
}

// Drops expired sessions and keeps only the most recent ones.
async function pruneSessions(keep: string, now: number): Promise<void> {
  const all = await safeStorageGetAll();
  const sessions = Object.entries(all)
    .filter(([key]) => key.startsWith(PROFILE_SESSION_KEY_PREFIX))
    .map(([key, value]) => ({ key, session: value as ProfileSession }));
  const keepKey = profileSessionStorageKey(keep);
  const ranked = sessions.filter(({ key, session }) => key === keepKey || isRetained(session, now)).sort((a, b) => b.session.lastValidatedAt - a.session.lastValidatedAt);
  const kept = new Set([keepKey, ...ranked.slice(0, MAX_SESSIONS).map(({ key }) => key)]);
  const removed = sessions.map(({ key }) => key).filter((key) => !kept.has(key));
  if (removed.length > 0) await safeStorageRemove(removed);
}

export async function clearProfileSessions(): Promise<void> {
  const all = await safeStorageGetAll();
  await safeStorageRemove([LEGACY_PROFILE_SESSIONS_STORAGE_KEY, ...Object.keys(all).filter((key) => key.startsWith(PROFILE_SESSION_KEY_PREFIX))]);
}
