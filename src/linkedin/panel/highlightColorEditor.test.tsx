// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EMPTY_PROFILE } from "../../models/profile";
import { PanelApp } from "./PanelApp";
import { setPanelProfileData } from "./panelStore";
import { panelToolPreference } from "../../optimizer/optimizerPreferences";
import { getHighlightRule, resetHighlightRuleForTests, resetSettingsOriginForTests } from "./settingsNav";
import { highlightPreferences, readHighlightPreferences, recentHighlightColors, HIGHLIGHT_PREFERENCES_STORAGE_KEY, RECENT_COLORS_STORAGE_KEY } from "./highlightPreferences";
import { DEFAULT_HIGHLIGHT_PREFERENCES } from "../../signals/highlightCategories";
import { setSignalModeEnabled } from "./signalModeStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored: Record<string, unknown> = {};
const sendMessage = vi.fn();

vi.stubGlobal("chrome", {
  runtime: { id: "test", sendMessage, lastError: undefined },
  storage: {
    local: {
      get: (keys: string | string[] | null) => {
        const list = keys === null ? Object.keys(stored) : Array.isArray(keys) ? keys : [keys];
        return Promise.resolve(Object.fromEntries(list.filter((k) => k in stored).map((k) => [k, structuredClone(stored[k])])));
      },
      set: (items: Record<string, unknown>) => {
        Object.assign(stored, structuredClone(items));
        return Promise.resolve();
      },
      remove: () => Promise.resolve(),
    },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
});

let root: Root | null = null;
let container: HTMLElement;

async function mountPanel() {
  setPanelProfileData({ profileKey: "jordan", profile: { ...EMPTY_PROFILE, name: "Jordan Rivera", extracted: true }, collection: null, autoScanProgress: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<PanelApp onClose={() => {}} />));
  await act(async () => {});
}

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  highlightPreferences.set(DEFAULT_HIGHLIGHT_PREFERENCES);
  recentHighlightColors.set([]);
  setSignalModeEnabled(true);
  resetSettingsOriginForTests();
  resetHighlightRuleForTests();
  panelToolPreference.set("settings");
  sendMessage.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const q = <T extends Element = HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
// Matched by value: jsdom's selector engine misreads the "&" in "Skills & Tools".
const rowButton = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button[aria-label]")].find((b) => b.getAttribute("aria-label") === `${label} settings`)!;
const hex = () => q<HTMLInputElement>("#lw-ce-hex");
const channel = (name: "Red" | "Green" | "Blue") => q<HTMLInputElement>(`input[aria-label="${name}"]`);
const rgb = () => [channel("Red").value, channel("Green").value, channel("Blue").value].map(Number);
const roles = () => highlightPreferences.getState().value.categories.roles;
const previewMarks = () => [...container.querySelectorAll<HTMLElement>(".lw-pv__mark, .lw-pv__pill--marked")];
const marksIn = (card: string) => [...container.querySelectorAll<HTMLElement>(`[aria-label="${card}"] .lw-pv__mark, [aria-label="${card}"] .lw-pv__pill--marked`)].map((m) => m.textContent);

async function openCategory(label: string) {
  await act(async () => rowButton(label).click());
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function leave(input: HTMLInputElement) {
  await act(async () => input.blur());
}

// A 100×100 control at the origin: clientX/clientY are percentages of it.
async function drag(element: HTMLElement, points: [number, number][]) {
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  const fire = (type: string, [x, y]: [number, number]) => element.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
  await act(async () => {
    fire("pointerdown", points[0]!);
    for (const point of points.slice(1)) fire("pointermove", point);
    fire("pointerup", points.at(-1)!);
  });
}

describe("highlight category page", () => {
  it("opens a category as its own page inside Settings, and Back returns to the list", async () => {
    await mountPanel();
    expect(container.querySelector(".lw-art-hero")).not.toBeNull();
    await openCategory("Roles");
    expect(getHighlightRule()).toBe("roles");
    expect(q(".lw-rule-detail__title").textContent).toBe("Roles");
    // A functional page: no hero, no Scanning group, and none of the later Highlight Style controls.
    expect(container.querySelector(".lw-art-hero")).toBeNull();
    expect(container.textContent).not.toContain("Scanning");
    expect(container.textContent).not.toMatch(/Underline|Reset Preview|Real Examples|Generic Examples|Combined View/);
    expect(container.querySelector('[role="tablist"]')).toBeNull();

    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    expect(getHighlightRule()).toBeNull();
    expect(container.querySelector('[aria-label="Auto categories"]')).not.toBeNull();
  });

  it("lays out Preview, then HEX, then RGB in one row, then Recent Colors, Opacity, and Live Preview below", async () => {
    await mountPanel();
    await openCategory("Roles");
    const labels = [...container.querySelectorAll(".lw-ce__label")].map((el) => el.textContent);
    expect(labels).toEqual(["Preview", "HEX", "RGB", "Recent Colors", "Opacity"]);
    expect(q(".lw-ce__rgb").querySelectorAll("input")).toHaveLength(3);
    const sections = [...container.querySelectorAll(".lw-rule-detail > section")].map((el) => el.getAttribute("aria-label"));
    expect(sections).toEqual(["Roles color", "Live preview"]);
    const cards = [...container.querySelectorAll(".lw-live > article")].map((el) => el.getAttribute("aria-label"));
    expect(cards).toEqual(["Post example", "Experience example", "Skills example", "Education example"]);
  });

  it("opens with the preset's own color and opacity", async () => {
    await mountPanel();
    await openCategory("Roles");
    expect(hex().value).toBe("#0A66C2");
    expect(rgb()).toEqual([10, 102, 194]);
    expect(q<HTMLInputElement>("#lw-ce-opacity").value).toBe("14");
  });

  it("updates HEX, RGB, the preview, and the stored color from the square and the hue slider", async () => {
    await mountPanel();
    await openCategory("Roles");
    // Top-right corner: full saturation and brightness of the current hue (blue's 210°).
    await drag(q(".lw-ce__square"), [[50, 50], [100, 0]]);
    expect(hex().value).toBe("#0080FF");
    expect(rgb()).toEqual([0, 128, 255]);
    expect(roles().custom).toEqual({ hex: "#0080FF", opacity: 0.14 });
    // Top of the hue slider is red.
    await drag(q(".lw-ce__hue"), [[5, 0]]);
    expect(hex().value).toBe("#FF0000");
    expect(previewMarks()[0]!.style.backgroundColor).toBe("rgba(255, 0, 0, 0.14)");
    expect(q(".lw-ce__preview > span").style.backgroundColor).toBe("rgba(255, 0, 0, 0.14)");
  });

  it("syncs HEX into RGB and RGB into HEX, normalizing and keeping the last valid color", async () => {
    await mountPanel();
    await openCategory("Roles");
    await typeInto(hex(), "4f46e5");
    expect(rgb()).toEqual([79, 70, 229]);
    expect(roles().custom?.hex).toBe("#4F46E5");
    await leave(hex());
    expect(hex().value).toBe("#4F46E5");

    // Still typing: nothing breaks until the value is a color again.
    await typeInto(hex(), "#4F4");
    expect(roles().custom?.hex).toBe("#4F46E5");
    expect(previewMarks()[0]!.style.backgroundColor).toBe("rgba(79, 70, 229, 0.14)");
    await typeInto(hex(), "zz12");
    await leave(hex());
    expect(hex().value).toBe("#4F46E5");

    await typeInto(channel("Red"), "250");
    expect(hex().value).toBe("#FA46E5");
    expect(roles().custom?.hex).toBe("#FA46E5");
  });

  it("clamps RGB to 0–255 and ignores what is not a number", async () => {
    await mountPanel();
    await openCategory("Roles");
    await typeInto(channel("Green"), "999");
    expect(channel("Green").value).toBe("255");
    expect(hex().value).toBe("#0AFFC2");
    await typeInto(channel("Blue"), "-12");
    expect(channel("Blue").value).toBe("12");
    await typeInto(channel("Blue"), "");
    expect(roles().custom?.hex).toBe("#0AFF0C");
    await leave(channel("Blue"));
    expect(channel("Blue").value).toBe("12");
  });

  it("remembers settled colors in Recent Colors, applies one on click, and persists them", async () => {
    await mountPanel();
    await openCategory("Roles");
    // Before any custom color, the presets are offered.
    expect(container.querySelectorAll(".lw-ce__recent-color")).toHaveLength(8);
    await typeInto(hex(), "#4F46E5");
    await leave(hex());
    await typeInto(hex(), "#FACC15");
    await leave(hex());
    expect(stored[RECENT_COLORS_STORAGE_KEY]).toEqual(["#FACC15", "#4F46E5"]);
    const recent = [...container.querySelectorAll<HTMLButtonElement>(".lw-ce__recent-color")].map((b) => b.title);
    expect(recent).toEqual(["#FACC15", "#4F46E5"]);
    await act(async () => q<HTMLButtonElement>('[aria-label="Use #4F46E5"]').click());
    expect(roles().custom?.hex).toBe("#4F46E5");
    expect(hex().value).toBe("#4F46E5");
    expect(rgb()).toEqual([79, 70, 229]);
  });

  it("counts an edit across R, G, and B as one recent color", async () => {
    await mountPanel();
    await openCategory("Roles");
    await typeInto(channel("Red"), "250");
    await typeInto(channel("Green"), "200");
    await typeInto(channel("Blue"), "20");
    await leave(channel("Blue"));
    expect(recentHighlightColors.getState().value).toEqual(["#FAC814"]);
  });

  it("keeps opacity per category and shows it in the preview and Live Preview at once", async () => {
    await mountPanel();
    await openCategory("Roles");
    const slider = q<HTMLInputElement>("#lw-ce-opacity");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "35");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(q(".lw-ce__percent").textContent).toBe("35%");
    expect(roles().custom).toEqual({ hex: "#0A66C2", opacity: 0.35 });
    expect(previewMarks().every((m) => m.style.backgroundColor === "rgba(10, 102, 194, 0.35)")).toBe(true);
    await act(async () => slider.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })));
    expect((stored[HIGHLIGHT_PREFERENCES_STORAGE_KEY] as typeof DEFAULT_HIGHLIGHT_PREFERENCES).categories.roles.custom).toEqual({ hex: "#0A66C2", opacity: 0.35 });

    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    await openCategory("Skills & Tools");
    expect(q<HTMLInputElement>("#lw-ce-opacity").value).toBe("18");
    await typeInto(hex(), "#FACC15");
    expect(highlightPreferences.getState().value.categories.skills.custom).toEqual({ hex: "#FACC15", opacity: 0.18 });
    expect(roles().custom).toEqual({ hex: "#0A66C2", opacity: 0.35 });

    // Back and in again: the page shows what was saved.
    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    await openCategory("Roles");
    expect(q<HTMLInputElement>("#lw-ce-opacity").value).toBe("35");
    expect(hex().value).toBe("#0A66C2");
  });

  async function marksFor(label: string) {
    if (getHighlightRule()) await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    await openCategory(label);
    return { post: marksIn("Post example"), experience: marksIn("Experience example"), skills: marksIn("Skills example"), education: marksIn("Education example") };
  }

  it("shows the same four cards on every page, highlighting only the open category's fixed spans", async () => {
    await mountPanel();
    const ALL_SKILLS = ["Python", "C++", "React", "Node.js", "AWS", "Docker", "SQL", "Blender"];
    expect(await marksFor("Roles")).toEqual({ post: ["Software Engineer"], experience: ["Software Developer Intern"], skills: [], education: [] });
    expect(await marksFor("Meaningful Numbers")).toEqual({
      post: ["10,000+", "40%", "team of 5", "1st place", "124"],
      experience: ["Jun 2024 – Aug 2024", "500+", "30%", "team of 4", "2 product teams"],
      skills: [],
      education: ["2024 – 2028"],
    });
    expect(await marksFor("Impact")).toEqual({
      post: ["used by 10,000+ students", "improving engagement by 40%"],
      experience: ["used by 500+ employees", "improving workflow efficiency by 30%"],
      skills: [],
      education: [],
    });
    expect(await marksFor("Leadership")).toEqual({
      post: ["led the development", "team of 5 developers"],
      experience: ["Collaborated with a team of 4 engineers"],
      skills: [],
      education: [],
    });
    expect(await marksFor("Skills & Tools")).toEqual({
      post: ["React", "Python", "AWS"],
      experience: ["TypeScript", "React", "Azure"],
      skills: ALL_SKILLS,
      education: ["AI", "Machine Learning", "Database Systems", "Computer Vision"],
    });
    expect(await marksFor("Achievements")).toEqual({ post: ["1st place", "regional hackathon"], experience: [], skills: [], education: [] });
    expect(await marksFor("Projects")).toEqual({ post: ["full-stack web application", "platform"], experience: ["internal tools", "features"], skills: [], education: [] });
    // Pills that do not apply stay neutral.
    expect(container.querySelectorAll(".lw-pv__pill:not(.lw-pv__pill--marked)")).toHaveLength(8);
    // Marks keep the text around them intact.
    expect(container.querySelector('[aria-label="Post example"] .lw-pv__body')!.textContent).toContain("the development of a full-stack web application used by");
  });

  it("adds a languages line only on the Languages page", async () => {
    await mountPanel();
    expect((await marksFor("Roles")).education).toEqual([]);
    expect(container.textContent).not.toContain("Languages: English");
    expect((await marksFor("Languages")).education).toEqual(["English", "Spanish", "Arabic"]);
  });

  it("draws Numbers with their underline, like on the profile, and Keywords from the user's own list", async () => {
    await mountPanel();
    await marksFor("Meaningful Numbers");
    expect(previewMarks()[0]!.style.textDecoration).toContain("underline");
    const { highlightKeywordsPreference } = await import("./keywordPreference");
    highlightKeywordsPreference.set("react, AI");
    const marks = await marksFor("Keywords");
    expect(marks.post).toEqual(["React"]);
    expect(marks.skills).toEqual(["React"]);
    // Whole words only: "AI" is not found inside "maintained".
    expect(marks.experience).toEqual(["React"]);
    expect(marks.education).toEqual(["AI"]);
    highlightKeywordsPreference.set("");
  });

  it("updates every card at once when the color or opacity changes", async () => {
    await mountPanel();
    await marksFor("Skills & Tools");
    await typeInto(hex(), "#8BC7FF");
    const slider = q<HTMLInputElement>("#lw-ce-opacity");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "45");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const colors = new Set(previewMarks().map((m) => m.style.backgroundColor));
    expect([...colors]).toEqual(["rgba(139, 199, 255, 0.45)"]);
    // 3 in the post, 3 in Experience, 8 pills, 4 courses.
    expect(previewMarks()).toHaveLength(18);
  });

  it("never asks for AI while colors change", async () => {
    await mountPanel();
    await openCategory("Roles");
    await drag(q(".lw-ce__square"), [[10, 10], [60, 40]]);
    await typeInto(hex(), "#22C55E");
    await typeInto(channel("Blue"), "200");
    await act(async () => container.querySelector<HTMLButtonElement>(".lw-ce__recent-color")!.click());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("goes back to the list scrolled where it was left", async () => {
    await mountPanel();
    const body = q(".lw-panel__body");
    body.scrollTop = 240;
    await openCategory("Languages");
    expect(body.scrollTop).toBe(0);
    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    expect(body.scrollTop).toBe(240);
  });

  it("picking a preset swatch in the list replaces a custom color", async () => {
    await mountPanel();
    highlightPreferences.setCategory("roles", { custom: { hex: "#FACC15", opacity: 0.4 } });
    await act(async () => {});
    const row = [...container.querySelectorAll(".lw-rule")].find((r) => r.textContent?.includes("Roles"))!;
    expect(row.querySelector<HTMLElement>(".lw-dot__button")!.style.backgroundColor).toBe("rgb(250, 204, 21)");
    await act(async () => row.querySelector<HTMLButtonElement>(".lw-dot__button")!.click());
    await act(async () => row.querySelector<HTMLButtonElement>('[aria-label="Pink"]')!.click());
    expect(roles()).toEqual({ enabled: true, color: "pink", underline: false });
  });
});

describe("stored custom colors", () => {
  it("restore after a reload, and a broken value falls back to the preset", () => {
    const restored = readHighlightPreferences({
      [HIGHLIGHT_PREFERENCES_STORAGE_KEY]: {
        categories: { roles: { enabled: true, color: "blue", underline: false, custom: { hex: "#facc15", opacity: 0.35 } }, skills: { color: "sky", custom: { hex: "nope", opacity: 1 } } },
      },
    });
    expect(restored.categories.roles.custom).toEqual({ hex: "#FACC15", opacity: 0.35 });
    expect(restored.categories.skills.custom).toBeUndefined();
    expect(restored.categories.skills.color).toBe("sky");
  });

  it("keep at most eight recent colors, newest first, without repeats", async () => {
    const { rememberRecentColor } = await import("./highlightPreferences");
    for (const c of ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888", "#999999", "#333333"]) rememberRecentColor(c);
    expect(recentHighlightColors.getState().value).toEqual(["#333333", "#999999", "#888888", "#777777", "#666666", "#555555", "#444444", "#222222"]);
  });
});
