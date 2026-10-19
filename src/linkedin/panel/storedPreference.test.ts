// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBooleanPreference } from "./storedPreference";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (keys: string | string[]) => Promise.resolve(Object.fromEntries([keys].flat().filter((k) => k in data).map((k) => [k, data[k]]))),
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

describe("highlightPreferences", () => {
  async function fresh() {
    vi.resetModules();
    const { highlightPreferences } = await import("./highlightPreferences");
    highlightPreferences.init();
    await vi.waitFor(() => expect(highlightPreferences.getState().loaded).toBe(true));
    return highlightPreferences;
  }

  it("starts every category on, in its own distinct color", async () => {
    const { categories, keywords } = (await fresh()).getState().value;
    const colors = Object.values(categories).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(Object.values(categories).every((c) => c.enabled)).toBe(true);
    expect(Object.values(categories).every((c) => c.look === "solid")).toBe(true);
    expect(keywords).toEqual({ enabled: true, color: "orange", look: "solid" });
  });

  it("gives a custom legacy Signal color to Impact, and the old keyword color to Keywords", async () => {
    data["finder.signalHighlightColor.v1"] = "yellow";
    data["finder.keywordHighlightColor.v1"] = "mint";
    const { categories, keywords } = (await fresh()).getState().value;
    expect(categories.impact.color).toBe("yellow");
    // Achievements had yellow by default, so it takes Impact's old green and nothing doubles up.
    expect(categories.achievements.color).toBe("green");
    expect(keywords.color).toBe("mint");
  });

  it("keeps the defaults for the legacy default color or an unknown one", async () => {
    data["finder.signalHighlightColor.v1"] = "blue";
    expect((await fresh()).getState().value.categories.impact.color).toBe("green");
    data["finder.signalHighlightColor.v1"] = "hotpink";
    expect((await fresh()).getState().value.categories.impact.color).toBe("green");
  });

  it("persists category colors, switches, and looks, and the saved value wins over legacy keys", async () => {
    data["finder.signalHighlightColor.v1"] = "yellow";
    const prefs = await fresh();
    prefs.setCategory("roles", { color: "pink", look: "dashed" });
    prefs.setCategory("numbers", { enabled: false });
    prefs.setKeywords({ look: "text" });
    await vi.waitFor(() => expect(data["finder.highlightPreferences.v1"]).toBeDefined());
    const { categories, keywords } = (await fresh()).getState().value;
    expect(categories.roles).toEqual({ enabled: true, color: "pink", look: "dashed" });
    expect(categories.numbers.enabled).toBe(false);
    expect(categories.numbers.color).toBe("mint");
    expect(categories.impact.color).toBe("yellow");
    expect(keywords.look).toBe("text");
  });

  it("repairs a damaged saved value field by field", async () => {
    data["finder.highlightPreferences.v1"] = { categories: { roles: { color: "neon", enabled: false, look: "rounded" }, numbers: { color: "mint", underline: true } }, keywords: "x" };
    const { categories, keywords } = (await fresh()).getState().value;
    expect(categories.roles).toEqual({ enabled: false, color: "blue", look: "solid" });
    // The old underline flag (from before looks) is dropped; the rule opens as Solid.
    expect(categories.numbers).toEqual({ enabled: true, color: "mint", look: "solid" });
    expect(keywords.color).toBe("orange");
  });

  it("keeps the Job Filters palette at its eight colors", async () => {
    const { HIGHLIGHT_COLORS, PROFILE_HIGHLIGHT_COLORS, toHighlightColor } = await import("../highlightPalette");
    expect(HIGHLIGHT_COLORS).toHaveLength(8);
    expect(PROFILE_HIGHLIGHT_COLORS.every((color) => toHighlightColor(color) === color)).toBe(true);
    expect(toHighlightColor(3)).toBeUndefined();
  });
});
