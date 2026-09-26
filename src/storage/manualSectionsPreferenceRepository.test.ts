// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadManualSectionsPreference, saveManualSectionsPreference } from "./manualSectionsPreferenceRepository";

function installFakeChromeStorage() {
  const data: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test-extension-id" },
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
          return Promise.resolve();
        },
      },
    },
  };
}

describe("manualSectionsPreferenceRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("defaults to on", async () => {
    expect(await loadManualSectionsPreference()).toBe(true);
  });

  it("round-trips off and on", async () => {
    await saveManualSectionsPreference(false);
    expect(await loadManualSectionsPreference()).toBe(false);
    await saveManualSectionsPreference(true);
    expect(await loadManualSectionsPreference()).toBe(true);
  });
});
