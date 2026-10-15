// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPersistentCache } from "./persistentCache";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let data: Record<string, unknown>;
let listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[];

beforeEach(() => {
  data = {};
  listeners = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in data ? { [key]: structuredClone(data[key]) } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          return Promise.resolve();
        },
      },
      onChanged: { addListener: (listener: (typeof listeners)[number]) => listeners.push(listener) },
    },
  };
});

describe("createPersistentCache", () => {
  it("survives a reload through storage", async () => {
    createPersistentCache<number>("k", 1000, 10).set("a", 1, 0);
    await flush();
    const reloaded = createPersistentCache<number>("k", 1000, 10);
    expect(reloaded.isReady()).toBe(true);
    const hydrating = reloaded.hydrate();
    expect(reloaded.isReady()).toBe(false);
    await hydrating;
    expect(reloaded.get("a", 500)).toBe(1);
  });

  it("expires entries after the ttl", () => {
    const cache = createPersistentCache<number>("k", 1000, 10);
    cache.set("a", 1, 0);
    expect(cache.get("a", 999)).toBe(1);
    expect(cache.get("a", 1000)).toBeUndefined();
  });

  it("keeps only the newest entries in storage", async () => {
    const cache = createPersistentCache<number>("k", 10000, 2);
    cache.set("a", 1, 1);
    cache.set("b", 2, 2);
    cache.set("c", 3, 3);
    await flush();
    expect(Object.keys(data.k as object)).toEqual(["c", "b"]);
  });

  it("never drops an entry another tab saved after this one loaded", async () => {
    const tabA = createPersistentCache<number>("k", 10000, 10);
    const tabB = createPersistentCache<number>("k", 10000, 10);
    tabA.set("newer-analysis", 2, 5);
    await flush();
    tabB.set("other-profile", 7, 6);
    await flush();
    expect(Object.keys(data.k as object).sort()).toEqual(["newer-analysis", "other-profile"]);
    expect(tabB.get("newer-analysis", 7)).toBe(2);
  });

  it("serves an entry another tab saved while this one was open, without asking again", () => {
    const tab = createPersistentCache<number>("k", 10000, 10);
    expect(tab.get("enriched", 5)).toBeUndefined();
    for (const listener of listeners) listener({ k: { newValue: { enriched: { savedAt: 4, value: 91 } } } }, "local");
    expect(tab.get("enriched", 5)).toBe(91);
  });

  it("never lets an older stored copy replace a newer one", () => {
    const tab = createPersistentCache<number>("k", 10000, 10);
    tab.set("profile", 91, 8);
    for (const listener of listeners) listener({ k: { newValue: { profile: { savedAt: 3, value: 82 } } } }, "local");
    expect(tab.get("profile", 9)).toBe(91);
  });
});
