// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearProfileEvidence, loadProfileEvidence, saveProfileEvidence } from "./profileEvidenceRepository";
import { EMPTY_PROFILE } from "../models/profile";

function installFakeChromeStorage() {
  const data: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (keys: string | string[]) =>
          Promise.resolve(
            (Array.isArray(keys) ? keys : [keys]).reduce<Record<string, unknown>>((acc, key) => {
              if (key in data) acc[key] = data[key];
              return acc;
            }, {}),
          ),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
          return Promise.resolve();
        },
        remove: (key: string) => {
          delete data[key];
          return Promise.resolve();
        },
      },
    },
  };
}

describe("profileEvidenceRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("round-trips saved evidence for the same profileKey", async () => {
    const profile = { ...EMPTY_PROFILE, extracted: true, name: "Illia Reviakin" };
    await saveProfileEvidence("irev1ak1n", profile);
    expect(await loadProfileEvidence("irev1ak1n")).toEqual(profile);
  });

  it("returns an empty profile for a different profileKey than what's saved", async () => {
    const profile = { ...EMPTY_PROFILE, extracted: true, name: "Illia Reviakin" };
    await saveProfileEvidence("irev1ak1n", profile);
    expect(await loadProfileEvidence("someone-else")).toEqual(EMPTY_PROFILE);
  });

  it("returns an empty profile when nothing has been saved yet", async () => {
    expect(await loadProfileEvidence("irev1ak1n")).toEqual(EMPTY_PROFILE);
  });

  it("clears saved evidence", async () => {
    const profile = { ...EMPTY_PROFILE, extracted: true, name: "Illia Reviakin" };
    await saveProfileEvidence("irev1ak1n", profile);
    await clearProfileEvidence();
    expect(await loadProfileEvidence("irev1ak1n")).toEqual(EMPTY_PROFILE);
  });
});
