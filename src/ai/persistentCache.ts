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

  function persist(now: number): void {
    const kept = [...entries.entries()]
      .filter(([, entry]) => fresh(entry, now))
      .sort(([, a], [, b]) => b.savedAt - a.savedAt)
      .slice(0, maxEntries);
    void safeStorageSet({ [storageKey]: Object.fromEntries(kept) });
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
        .then((stored) => {
          const saved = stored[storageKey];
          if (saved && typeof saved === "object") {
            for (const [key, entry] of Object.entries(saved as Record<string, Entry<T>>)) {
              if (!entries.has(key)) entries.set(key, entry);
            }
          }
        })
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
