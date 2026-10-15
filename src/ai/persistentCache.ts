import { isExtensionContextValid } from "../linkedin/extensionContext";
import { safeStorageGet, safeStorageSet } from "../storage/safeChromeStorage";

interface Entry<T> {
  savedAt: number;
  value: T;
}

export interface PersistentCache<T> {
  get(key: string, now?: number): T | undefined;
  set(key: string, value: T, now?: number): void;
  hydrate(): Promise<void>;
  isReady(): boolean;
  whenReady(): Promise<void>;
  clear(): void;
}

export function createPersistentCache<T>(storageKey: string, ttlMs: number, maxEntries: number): PersistentCache<T> {
  const entries = new Map<string, Entry<T>>();
  let loading: Promise<void> | null = null;
  let ready = true;

  function fresh(entry: Entry<T> | undefined, now: number): entry is Entry<T> {
    return !!entry && now - entry.savedAt < ttlMs;
  }

  // The newer copy of an entry wins, wherever it came from.
  function absorb(saved: unknown): void {
    if (!saved || typeof saved !== "object") return;
    for (const [key, entry] of Object.entries(saved as Record<string, Entry<T>>)) {
      const mine = entries.get(key);
      if (!mine || entry.savedAt > mine.savedAt) entries.set(key, entry);
    }
  }

  // Entries another tab saves become available here too, without asking again.
  if (isExtensionContextValid()) {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === "local" && changes[storageKey]) absorb(changes[storageKey].newValue);
    });
  }

  // Merges with what is stored first, so a tab that loaded the cache earlier never drops entries
  // another tab saved since.
  let writing: Promise<void> = Promise.resolve();
  function persist(now: number): void {
    writing = writing
      .then(async () => {
        absorb((await safeStorageGet(storageKey))[storageKey]);
        const kept = [...entries.entries()]
          .filter(([, entry]) => fresh(entry, now))
          .sort(([, a], [, b]) => b.savedAt - a.savedAt)
          .slice(0, maxEntries);
        await safeStorageSet({ [storageKey]: Object.fromEntries(kept) });
      })
      .catch(() => {});
  }

  return {
    get(key, now = Date.now()) {
      const entry = entries.get(key);
      return fresh(entry, now) ? entry.value : undefined;
    },
    set(key, value, now = Date.now()) {
      entries.set(key, { savedAt: now, value });
      persist(now);
    },
    hydrate() {
      if (loading) return loading;
      ready = false;
      loading = safeStorageGet(storageKey)
        .then((stored) => absorb(stored[storageKey]))
        .catch(() => {})
        .finally(() => {
          ready = true;
        });
      return loading;
    },
    isReady: () => ready,
    whenReady: () => loading ?? Promise.resolve(),
    clear() {
      entries.clear();
    },
  };
}
