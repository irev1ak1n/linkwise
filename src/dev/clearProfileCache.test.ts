import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProfileCache } from "./clearProfileCache";

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("chrome", {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (keys: string | string[] | null) => {
          const list = keys === null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
          return Promise.resolve(Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]])));
        },
        set: (items: Record<string, unknown>) => Promise.resolve(void Object.assign(store, items)),
        remove: (keys: string | string[]) => Promise.resolve(void [keys].flat().forEach((k) => delete store[k])),
      },
    },
  });
});

const entry = (value: unknown = 1) => ({ savedAt: 1, value });

describe("clearProfileCache", () => {
  it("removes only the given profile's cached data and keeps everything else", async () => {
    store = {
      "finder.profileSession.v3:me": { profileKey: "me" },
      "finder.profileSession.v3:other": { profileKey: "other" },
      "finder.profileSessions.v2": { me: {}, other: {} },
      "finder.autoScanSession.v1": { profileKey: "me" },
      "finder.analysisCache.v1": { "v4:me:abc:def": entry(), "v4:other:abc:def": entry() },
      "finder.analysisLatest.v1": { "me|goal": entry(), "other|goal": entry() },
      "finder.signalGrades.v2": { "3.10:me:none:x": entry(), "3.10:other:none:x": entry() },
      "finder.optimizerCache.v1": { "v1:me:h:c": entry() },
      "finder.optimizerSectionCache.v1": { "v1:headline:me:h:c": entry(), "v1:headline:other:h:c": entry() },
      "finder.optimizerChecklistCache.v1": { "v1:checklist:about:me:a:b:c": entry() },
      "finder.goals.v1": [{ id: "g" }],
      "finder.highlightPreferences.v1": { color: "red" },
    };
    await clearProfileCache("me");
    expect(store).toEqual({
      "finder.profileSession.v3:other": { profileKey: "other" },
      "finder.profileSessions.v2": { other: {} },
      "finder.analysisCache.v1": { "v4:other:abc:def": entry() },
      "finder.analysisLatest.v1": { "other|goal": entry() },
      "finder.signalGrades.v2": { "3.10:other:none:x": entry() },
      "finder.optimizerSectionCache.v1": { "v1:headline:other:h:c": entry() },
      "finder.goals.v1": [{ id: "g" }],
      "finder.highlightPreferences.v1": { color: "red" },
    });
  });

  it("leaves another profile's scan session alone", async () => {
    store = { "finder.autoScanSession.v1": { profileKey: "other" } };
    await clearProfileCache("me");
    expect(store["finder.autoScanSession.v1"]).toEqual({ profileKey: "other" });
  });
});
