// Persists the Auto scan checklist so it survives a page reload, SPA navigation, or the
// service worker restarting. Keyed globally since only one scan runs at a time.
import type { AutoScanSession } from "../linkedin/autoScanSession";

const STORAGE_KEY = "finder.autoScanSession.v1";

export async function saveAutoScanSession(session: AutoScanSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

// Null when there's no session, or it belongs to a different person than profileKey.
export async function loadAutoScanSession(profileKey: string): Promise<AutoScanSession | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const session = stored[STORAGE_KEY] as AutoScanSession | undefined;
  if (!session || session.profileKey !== profileKey) return null;
  return session;
}

export async function clearAutoScanSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
