// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadJobsSettings, saveJobsSettings } from "./jobsSettingsRepository";
import { DEFAULT_JOBS_SETTINGS } from "../models/jobsSettings";

function installFakeChromeStorage() {
  const data: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test-extension-id" },
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
      },
    },
  };
}

describe("jobsSettingsRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("defaults to none/none, no keywords, case-insensitive on", async () => {
    expect(await loadJobsSettings()).toEqual(DEFAULT_JOBS_SETTINGS);
  });

  it("round-trips a full settings object", async () => {
    const settings = { appliedAction: "hide" as const, keywordsText: "Promoted, Senior", keywordAction: "highlight" as const, caseInsensitive: false };
    await saveJobsSettings(settings);
    expect(await loadJobsSettings()).toEqual(settings);
  });

  it("falls back to defaults for an invalid stored action", async () => {
    await saveJobsSettings({
      appliedAction: "not-real" as never,
      keywordsText: "test",
      keywordAction: "hide",
      caseInsensitive: true,
    });
    const loaded = await loadJobsSettings();
    expect(loaded.appliedAction).toBe("none");
    expect(loaded.keywordAction).toBe("hide");
  });
});
