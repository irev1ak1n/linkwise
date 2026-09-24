// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadEnhancedAnalysisPreference, saveEnhancedAnalysisPreference } from "./enhancedAnalysisPreferenceRepository";

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

describe("enhancedAnalysisPreferenceRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("defaults to off when nothing has been saved yet", async () => {
    expect(await loadEnhancedAnalysisPreference()).toBe(false);
  });

  it("round-trips true", async () => {
    await saveEnhancedAnalysisPreference(true);
    expect(await loadEnhancedAnalysisPreference()).toBe(true);
  });

  it("round-trips false explicitly (not just the default)", async () => {
    await saveEnhancedAnalysisPreference(true);
    await saveEnhancedAnalysisPreference(false);
    expect(await loadEnhancedAnalysisPreference()).toBe(false);
  });
});
