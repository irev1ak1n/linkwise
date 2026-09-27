// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBooleanPreference } from "./booleanPreference";

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
    expect(pref.getState()).toEqual({ enabled: true, loaded: false });
    pref.init();
    await vi.waitFor(() => expect(pref.getState().loaded).toBe(true));
    expect(pref.getState().enabled).toBe(true);
  });

  it("loads and saves a stored value", async () => {
    data.k = false;
    const pref = createBooleanPreference("k", true);
    pref.init();
    await vi.waitFor(() => expect(pref.getState()).toEqual({ enabled: false, loaded: true }));
    pref.set(true);
    await vi.waitFor(() => expect(data.k).toBe(true));
  });
});
