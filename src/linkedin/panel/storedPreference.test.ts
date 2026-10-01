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

describe("highlightKeywordsPreference", () => {
  async function freshPreference() {
    vi.resetModules();
    const { highlightKeywordsPreference } = await import("./keywordPreference");
    highlightKeywordsPreference.init();
    await vi.waitFor(() => expect(highlightKeywordsPreference.getState().loaded).toBe(true));
    return highlightKeywordsPreference;
  }

  it("starts empty and keeps the list exactly as typed for the next page", async () => {
    expect((await freshPreference()).getState().value).toBe("");
    (await freshPreference()).set("Python, TSA\nmachine learning");
    await vi.waitFor(() => expect(data["finder.highlightKeywords.v1"]).toBe("Python, TSA\nmachine learning"));
    expect((await freshPreference()).getState().value).toBe("Python, TSA\nmachine learning");
  });

  it("ignores a stored value that is not text", async () => {
    data["finder.highlightKeywords.v1"] = ["Python"];
    expect((await freshPreference()).getState().value).toBe("");
  });
});

describe("highlightColorPreference", () => {
  async function freshPreference() {
    vi.resetModules();
    const { highlightColorPreference } = await import("./highlightColorPreference");
    highlightColorPreference.init();
    await vi.waitFor(() => expect(highlightColorPreference.getState().loaded).toBe(true));
    return highlightColorPreference;
  }

  it("defaults to the original blue and keeps the chosen color for the next profile", async () => {
    expect((await freshPreference()).getState().value).toBe("blue");
    (await freshPreference()).set("yellow");
    await vi.waitFor(() => expect(data["finder.signalHighlightColor.v1"]).toBe("yellow"));
    expect((await freshPreference()).getState().value).toBe("yellow");
  });

  it("falls back to the default for a color that is not in the palette", async () => {
    data["finder.signalHighlightColor.v1"] = "hotpink";
    expect((await freshPreference()).getState().value).toBe("blue");
    const { HIGHLIGHT_COLORS, toHighlightColor } = await import("../highlightPalette");
    expect(HIGHLIGHT_COLORS).toHaveLength(8);
    expect(HIGHLIGHT_COLORS.every((color) => toHighlightColor(color) === color)).toBe(true);
    expect(toHighlightColor(3)).toBeUndefined();
  });
});

describe("keywordColorPreference", () => {
  async function freshPreference() {
    vi.resetModules();
    const { keywordColorPreference } = await import("./keywordColorPreference");
    keywordColorPreference.init();
    await vi.waitFor(() => expect(keywordColorPreference.getState().loaded).toBe(true));
    return keywordColorPreference;
  }

  it("defaults to the original amber and keeps a chosen color", async () => {
    expect((await freshPreference()).getState().value).toBe("orange");
    (await freshPreference()).set("green");
    await vi.waitFor(() => expect(data["finder.keywordHighlightColor.v1"]).toBe("green"));
    expect((await freshPreference()).getState().value).toBe("green");
  });

  it("falls back to amber for an unknown stored color", async () => {
    data["finder.keywordHighlightColor.v1"] = "neon";
    expect((await freshPreference()).getState().value).toBe("orange");
  });
});
