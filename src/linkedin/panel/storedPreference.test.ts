// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBooleanPreference } from "./storedPreference";
import { AUTO_SCROLL_SPEED_STORAGE_KEY, DEFAULT_AUTO_SCROLL_SPEED, toAutoScrollSpeed } from "./autoScrollSpeedPreference";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
          return Promise.resolve();
        },
      },
      onChanged: { addListener: vi.fn() },
    },
  };
});

describe("createBooleanPreference", () => {
  it("uses the default until storage says otherwise", async () => {
    const pref = createBooleanPreference("k", true);
    expect(pref.getState()).toEqual({ value: true, loaded: false });
    pref.init();
    await vi.waitFor(() => expect(pref.getState().loaded).toBe(true));
    expect(pref.getState().value).toBe(true);
  });

  it("loads and saves a stored value", async () => {
    data.k = false;
    const pref = createBooleanPreference("k", true);
    pref.init();
    await vi.waitFor(() => expect(pref.getState()).toEqual({ value: false, loaded: true }));
    pref.set(true);
    await vi.waitFor(() => expect(data.k).toBe(true));
  });
});

describe("autoScrollSpeedPreference", () => {
  async function freshPreference() {
    vi.resetModules();
    const { autoScrollSpeedPreference } = await import("./autoScrollSpeedPreference");
    autoScrollSpeedPreference.init();
    await vi.waitFor(() => expect(autoScrollSpeedPreference.getState().loaded).toBe(true));
    return autoScrollSpeedPreference;
  }

  it("defaults to 1x", async () => {
    expect(DEFAULT_AUTO_SCROLL_SPEED).toBe(1);
    expect((await freshPreference()).getState().value).toBe(1);
  });

  it("keeps the chosen speed for the next profile", async () => {
    (await freshPreference()).set(0.75);
    await vi.waitFor(() => expect(data[AUTO_SCROLL_SPEED_STORAGE_KEY]).toBe(0.75));
    expect((await freshPreference()).getState().value).toBe(0.75);
  });

  it("falls back to 1x for a value that is not one of the offered speeds", async () => {
    data[AUTO_SCROLL_SPEED_STORAGE_KEY] = 7;
    expect((await freshPreference()).getState().value).toBe(1);
    expect(toAutoScrollSpeed("2")).toBeUndefined();
    expect(toAutoScrollSpeed(1.5)).toBe(1.5);
  });
});
