// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPersistentCache } from "./persistentCache";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
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
    },
  };
});

describe("createPersistentCache", () => {
  it("survives a reload through storage", async () => {
    createPersistentCache<number>("k", 1000, 10).set("a", 1, 0);
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

  it("keeps only the newest entries in storage", () => {
    const cache = createPersistentCache<number>("k", 10000, 2);
    cache.set("a", 1, 1);
    cache.set("b", 2, 2);
    cache.set("c", 3, 3);
    expect(Object.keys(data.k as object)).toEqual(["c", "b"]);
  });
});
