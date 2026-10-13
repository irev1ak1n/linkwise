// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { loadScanMode, saveScanMode } from "./scanModeRepository";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (keys: string | string[]) =>
          Promise.resolve((Array.isArray(keys) ? keys : [keys]).reduce<Record<string, unknown>>((acc, key) => (key in data ? { ...acc, [key]: data[key] } : acc), {})),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
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

describe("scanModeRepository", () => {
  it("defaults to Analyze as I scroll and keeps both supported modes", async () => {
    expect(await loadScanMode()).toBe("scroll");
    await saveScanMode("auto");
    expect(await loadScanMode()).toBe("auto");
    await saveScanMode("scroll");
    expect(await loadScanMode()).toBe("scroll");
  });

  it("moves a saved Auto scroll mode to Auto scan and drops its speed setting", async () => {
    data["finder.scanMode.v1"] = "autoScroll";
    data["finder.autoScrollSpeed.v1"] = 1.5;
    expect(await loadScanMode()).toBe("auto");
    expect(data["finder.scanMode.v1"]).toBe("auto");
    expect("finder.autoScrollSpeed.v1" in data).toBe(false);
  });

  it("falls back to the default for anything else", async () => {
    data["finder.scanMode.v1"] = "teleport";
    expect(await loadScanMode()).toBe("scroll");
  });
});
