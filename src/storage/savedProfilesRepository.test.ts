// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_PROFILE } from "../models/profile";
import { MAX_HISTORY, deleteSavedProfile, listSavedProfiles, loadSavedProfile, saveProfile, savedProfileStorageKey, setSavedProfileNotes, updateSavedProfile } from "./savedProfilesRepository";
import type { SnapshotRecord } from "../savedProfiles/types";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (keys: string | string[] | null) => {
          if (keys === null) return Promise.resolve(structuredClone(data));
          const list = Array.isArray(keys) ? keys : [keys];
          return Promise.resolve(Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])));
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
          return Promise.resolve();
        },
      },
    },
  };
});

function record(name: string, recordedAt = 1): SnapshotRecord {
  return { recordedAt, origin: "saved", profile: { ...EMPTY_PROFILE, name, extracted: true }, completeSections: [], goal: null, analysis: null, changes: [] };
}

const save = (profileKey: string, name: string, at = 1) => saveProfile({ profileKey, profileName: name, profileUrl: `https://www.linkedin.com/in/${profileKey}/`, record: record(name, at) });

describe("savedProfilesRepository", () => {
  it("saves and loads a profile under its canonical key", async () => {
    await save("jordan-rivera", "Jordan Rivera");
    expect(Object.keys(data)).toEqual([savedProfileStorageKey("jordan-rivera")]);
    expect((await loadSavedProfile("jordan-rivera"))?.history[0]!.profile.name).toBe("Jordan Rivera");
  });

  it("never creates a duplicate or replaces the original snapshot when saved again", async () => {
    await save("jordan-rivera", "Jordan Rivera", 1);
    await save("jordan-rivera", "Jordan Rivera", 99);
    const saved = await loadSavedProfile("jordan-rivera");
    expect(saved?.history).toHaveLength(1);
    expect(saved?.savedAt).toBe(1);
    expect(await listSavedProfiles()).toHaveLength(1);
  });

  it("keeps each person apart, so one never shows another's evidence", async () => {
    await save("jordan-rivera", "Jordan Rivera");
    await save("sam-lee", "Sam Lee");
    expect((await loadSavedProfile("sam-lee"))?.history[0]!.profile.name).toBe("Sam Lee");
    // A record stored under the wrong key is never served for that key.
    data[savedProfileStorageKey("someone-else")] = data[savedProfileStorageKey("sam-lee")];
    expect(await loadSavedProfile("someone-else")).toBeNull();
    expect((await listSavedProfiles()).map((p) => p.profileKey).sort()).toEqual(["jordan-rivera", "sam-lee"]);
  });

  it("keeps at most the latest snapshots", async () => {
    await save("jordan-rivera", "Jordan Rivera");
    await updateSavedProfile("jordan-rivera", (current) => current && { ...current, history: Array.from({ length: 12 }, (_, i) => record("Jordan", 12 - i)) });
    const saved = await loadSavedProfile("jordan-rivera");
    expect(saved?.history).toHaveLength(MAX_HISTORY);
    expect(saved?.history[0]!.recordedAt).toBe(12);
  });

  it("stores notes and deletes a saved profile", async () => {
    await save("jordan-rivera", "Jordan Rivera");
    await setSavedProfileNotes("jordan-rivera", "Met at the robotics fair");
    expect((await loadSavedProfile("jordan-rivera"))?.notes).toBe("Met at the robotics fair");
    await deleteSavedProfile("jordan-rivera");
    expect(await loadSavedProfile("jordan-rivera")).toBeNull();
  });
});
