// Temporary demo helper: wipes everything LinkWise stored for one profile so it scans like a new one.
import { clearAutoScanSession, loadAutoScanSession } from "../storage/autoScanSessionRepository";
import { LEGACY_PROFILE_SESSIONS_STORAGE_KEY, profileSessionStorageKey } from "../storage/profileSessionRepository";
import { safeStorageGet, safeStorageRemove, safeStorageSet } from "../storage/safeChromeStorage";

// Cache keys carry the profile slug as a colon-separated segment; the analysis "latest" cache is prefixed with it and a pipe.
const SEGMENT_CACHES = ["finder.analysisCache.v1", "finder.signalGrades.v2", "finder.optimizerCache.v1", "finder.optimizerSectionCache.v1", "finder.optimizerChecklistCache.v1"];
const PREFIX_CACHES = ["finder.analysisLatest.v1"];

async function dropEntries(storageKey: string, matches: (entryKey: string) => boolean): Promise<void> {
  const saved = (await safeStorageGet(storageKey))[storageKey];
  if (!saved || typeof saved !== "object") return;
  const entries = Object.entries(saved as Record<string, unknown>);
  const kept = entries.filter(([key]) => !matches(key));
  if (kept.length === entries.length) return;
  if (kept.length === 0) await safeStorageRemove(storageKey);
  else await safeStorageSet({ [storageKey]: Object.fromEntries(kept) });
}

export async function clearProfileCache(profileKey: string): Promise<void> {
  await safeStorageRemove(profileSessionStorageKey(profileKey));

  const legacy = (await safeStorageGet(LEGACY_PROFILE_SESSIONS_STORAGE_KEY))[LEGACY_PROFILE_SESSIONS_STORAGE_KEY] as Record<string, unknown> | undefined;
  if (legacy && profileKey in legacy) {
    const { [profileKey]: _removed, ...rest } = legacy;
    if (Object.keys(rest).length === 0) await safeStorageRemove(LEGACY_PROFILE_SESSIONS_STORAGE_KEY);
    else await safeStorageSet({ [LEGACY_PROFILE_SESSIONS_STORAGE_KEY]: rest });
  }

  if (await loadAutoScanSession(profileKey)) await clearAutoScanSession();

  for (const key of SEGMENT_CACHES) await dropEntries(key, (entryKey) => entryKey.split(":").includes(profileKey));
  for (const key of PREFIX_CACHES) await dropEntries(key, (entryKey) => entryKey.startsWith(`${profileKey}|`));
}
