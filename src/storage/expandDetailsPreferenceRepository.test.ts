// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadExpandDetailsPreference, saveExpandDetailsPreference } from "./expandDetailsPreferenceRepository";

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

describe("expandDetailsPreferenceRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("defaults to off when nothing has been saved yet", async () => {
    expect(await loadExpandDetailsPreference()).toBe(false);
  });

  it("round-trips true", async () => {
    await saveExpandDetailsPreference(true);
    expect(await loadExpandDetailsPreference()).toBe(true);
  });

  it("round-trips false explicitly (not just the default)", async () => {
    await saveExpandDetailsPreference(true);
    await saveExpandDetailsPreference(false);
    expect(await loadExpandDetailsPreference()).toBe(false);
  });
});
