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

  it("defaults every highlight color to the original blue", async () => {
    const loaded = await loadJobsSettings();
    expect([loaded.appliedColor, loaded.viewedColor, loaded.savedColor, loaded.keywordColor]).toEqual(["blue", "blue", "blue", "blue"]);
  });

  it("keeps settings saved before colors existed, with default colors", async () => {
    await chrome.storage.local.set({ "finder.jobsSettings.v1": { appliedAction: "highlight", keywordsText: "Senior", keywordAction: "highlight", caseInsensitive: true } });
    const loaded = await loadJobsSettings();
    expect(loaded).toMatchObject({ appliedAction: "highlight", keywordAction: "highlight", appliedColor: "blue", keywordColor: "blue" });
  });

  it("falls back to the default for a color that is not in the palette", async () => {
    await chrome.storage.local.set({ "finder.jobsSettings.v1": { ...DEFAULT_JOBS_SETTINGS, savedColor: "hotpink", viewedColor: 7 } });
    const loaded = await loadJobsSettings();
    expect(loaded.savedColor).toBe("blue");
    expect(loaded.viewedColor).toBe("blue");
  });

  it("round-trips a full settings object", async () => {
    const settings = {
      appliedAction: "hide" as const,
      viewedAction: "highlight" as const,
      savedAction: "hide" as const,
      keywordsText: "Promoted, Senior",
      keywordAction: "highlight" as const,
      caseInsensitive: false,
      appliedColor: "coral" as const,
      viewedColor: "green" as const,
      savedColor: "violet" as const,
      keywordColor: "yellow" as const,
    };
    await saveJobsSettings(settings);
    expect(await loadJobsSettings()).toEqual(settings);
  });

  it("falls back to defaults for an invalid stored action", async () => {
    await saveJobsSettings({
      ...DEFAULT_JOBS_SETTINGS,
      appliedAction: "not-real" as never,
      viewedAction: "also-not-real" as never,
      savedAction: "hide",
      keywordsText: "test",
      keywordAction: "hide",
      caseInsensitive: true,
    });
    const loaded = await loadJobsSettings();
    expect(loaded.appliedAction).toBe("none");
    expect(loaded.viewedAction).toBe("none");
    expect(loaded.savedAction).toBe("hide");
    expect(loaded.keywordAction).toBe("hide");
  });
});
