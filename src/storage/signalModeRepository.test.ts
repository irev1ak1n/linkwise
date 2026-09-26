// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadSignalModePreference, saveSignalModePreference, SIGNAL_MODE_STORAGE_KEY } from "./signalModeRepository";

let data: Record<string, unknown>;

function installFakeChromeStorage(runtime: Record<string, unknown> = { id: "test-extension-id" }) {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime,
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

describe("signalModeRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("defaults to off", async () => {
    expect(await loadSignalModePreference()).toBe(false);
  });

  it("round-trips on and off", async () => {
    await saveSignalModePreference(true);
    expect(await loadSignalModePreference()).toBe(true);
    await saveSignalModePreference(false);
    expect(await loadSignalModePreference()).toBe(false);
  });

  it("treats a non-boolean stored value as off", async () => {
    data[SIGNAL_MODE_STORAGE_KEY] = "yes";
    expect(await loadSignalModePreference()).toBe(false);
  });

  it("reads as off from an invalidated extension context", async () => {
    installFakeChromeStorage({});
    data[SIGNAL_MODE_STORAGE_KEY] = true;
    expect(await loadSignalModePreference()).toBe(false);
  });
});
