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
const editableOpacity = (id: string) => {
  const prefs = highlightPreferences.getState().value;
  const style = id === "keywords" ? prefs.keywords : prefs.categories[id as keyof typeof prefs.categories];
  return style.custom!.opacity;
};
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
    // A functional page: no hero, no Scanning group, no preview tabs.
    expect(container.querySelector(".lw-art-hero")).toBeNull();
    expect(container.textContent).not.toContain("Scanning");
    expect(container.textContent).not.toMatch(/Rounded|Reset Preview|Real Examples|Generic Examples|Combined View/);
    expect(container.querySelector('[role="tablist"]')).toBeNull();

    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    expect(getHighlightRule()).toBeNull();
    expect(container.querySelector('[aria-label="Auto categories"]')).not.toBeNull();
  });

  it("has compact icon Back and Menu buttons that share one style, and Menu opens the menu", async () => {
    await mountPanel();
    await openCategory("Roles");
    const nav = [...container.querySelectorAll<HTMLButtonElement>(".lw-rule-detail__nav button")];
    expect(nav.map((b) => b.getAttribute("aria-label"))).toEqual(["Back to highlighting", "Open LinkWise menu"]);
    for (const b of nav) {
      expect(b.className).toBe("lw-nav-button");
      expect(b.querySelector("svg")).not.toBeNull();
      // An icon, never a text glyph.
      expect(b.textContent).toBe("");
    }
    await act(async () => nav[1]!.click());
    expect(panelToolPreference.getState().value).toBe("menu");
  });

  it("lays out Preview, then HEX, then RGB in one row, then Recent Colors, Opacity, and Live Preview below", async () => {
    await mountPanel();
    await openCategory("Roles");
    const labels = [...container.querySelectorAll(".lw-ce__label")].map((el) => el.textContent);
    expect(labels).toEqual(["Preview", "HEX", "RGB", "Recent Colors", "Opacity"]);
    expect(q(".lw-ce__rgb").querySelectorAll("input")).toHaveLength(3);
    const sections = [...container.querySelectorAll(".lw-rule-detail > section")].map((el) => el.getAttribute("aria-label"));
    expect(sections).toEqual(["Roles color", "Roles highlight style", "Live preview"]);
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

  it("does not count a color that arrives from elsewhere as a recent pick", async () => {
    await mountPanel();
    await openCategory("Roles");
    // Another tab, or a reset, changes the color while the page is open.
    await act(async () => highlightPreferences.setCategory("roles", { custom: { hex: "#123456", opacity: 0.3 } }));
    expect(hex().value).toBe("#123456");
    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    expect(recentHighlightColors.getState().value).toEqual([]);
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

  const EXPECTED = {
    post: ["led the development", "10,000+", "40%", "team of 5", "React, Python, and AWS", "1st place"],
    experience: ["500+", "30%", "TypeScript, React, and Azure", "team of 4", "2 product teams"],
    skills: ["Node.js"],
    education: ["AI", "Machine Learning"],
  };

  it("highlights the same fixed phrases on every category page, each in that page's own style", async () => {
    await mountPanel();
    const seen = new Map<string, string[]>();
    for (const label of ["Roles", "Skills & Tools", "Impact", "Achievements", "Meaningful Numbers", "Keywords"]) {
      expect(await marksFor(label)).toEqual(EXPECTED);
      // Every phrase takes the edited category's color, whatever kind of phrase it is.
      seen.set(label, [...new Set(previewMarks().map((m) => m.style.backgroundColor))]);
      expect(seen.get(label)).toHaveLength(1);
    }
    expect(seen.get("Roles")).toEqual(["rgba(10, 102, 194, 0.14)"]);
    expect(seen.get("Skills & Tools")).toEqual(["rgba(3, 169, 244, 0.18)"]);
    expect(seen.get("Impact")).toEqual(["rgba(76, 175, 80, 0.26)"]);
    // Neutral pills stay gray; the text around marks is intact.
    expect(container.querySelectorAll(".lw-pv__pill:not(.lw-pv__pill--marked)")).toHaveLength(7);
    expect(container.querySelector('[aria-label="Post example"] .lw-pv__body')!.textContent).toBe(
      "Excited to share that I led the development of a full-stack web application used by 10,000+ students, improving engagement by 40%. I worked with a team of 5 developers using React, Python, and AWS to design and launch the platform. This project also earned 1st place at our regional hackathon.",
    );
  });

  const looks = () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Highlight style"] [role="radio"]')];
  const pickLook = async (label: string) => act(async () => looks().find((b) => b.textContent?.includes(label))!.click());

  it("offers six highlight styles in a 3 by 2 grid, Solid first and selected by default", async () => {
    await mountPanel();
    await openCategory("Roles");
    expect(looks().map((b) => b.querySelector(".lw-hs__label")!.textContent)).toEqual(["Solid", "Soft", "Underline", "Text Color", "Dashed", "Left Border"]);
    expect(container.textContent).not.toContain("Rounded");
    expect(looks().filter((b) => b.getAttribute("aria-checked") === "true").map((b) => b.textContent)).toEqual(["AaSolid"]);
    // Text Color's sample is "Abc" in the color itself, with no background.
    const text = looks()[3]!.querySelector<HTMLElement>(".lw-hs__mark")!;
    expect(text.textContent).toBe("Abc");
    expect(text.style.backgroundColor).toBe("transparent");
    expect(text.style.color).not.toBe("");
  });

  it("restyles the same preview phrases for every look, never fading the text, with no AI", async () => {
    await mountPanel();
    await openCategory("Skills & Tools");
    await typeInto(hex(), "#F59AC1");
    sendMessage.mockClear();
    const mark = () => previewMarks()[0]!.style;
    const expectations: [string, (s: CSSStyleDeclaration) => void][] = [
      ["Soft", (s) => expect(s.backgroundColor).toBe("rgba(245, 154, 193, 0.07)")],
      ["Underline", (s) => (expect(s.backgroundColor).toBe("transparent"), expect(s.textDecoration).toContain("underline"))],
      ["Text Color", (s) => (expect(s.backgroundColor).toBe("transparent"), expect(s.color).not.toBe(""))],
      ["Dashed", (s) => expect(s.border).toContain("dashed")],
      ["Left Border", (s) => (expect(s.borderLeft).toContain("solid"), expect(s.border).not.toContain("dashed"))],
      ["Solid", (s) => expect(s.backgroundColor).toBe("rgba(245, 154, 193, 0.18)")],
    ];
    for (const [label, check] of expectations) {
      await pickLook(label);
      expect(looks().find((b) => b.getAttribute("aria-checked") === "true")!.textContent).toContain(label);
      check(mark());
      expect(previewMarks().map((m) => m.textContent)).toEqual(FIXTURE_PHRASES);
      expect(previewMarks().every((m) => m.style.opacity === "")).toBe(true);
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the chosen look after leaving and reopening the page, and in storage", async () => {
    await mountPanel();
    await openCategory("Projects");
    await pickLook("Left Border");
    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    await openCategory("Projects");
    expect(looks().find((b) => b.getAttribute("aria-checked") === "true")!.textContent).toContain("Left Border");
    expect((stored[HIGHLIGHT_PREFERENCES_STORAGE_KEY] as typeof DEFAULT_HIGHLIGHT_PREFERENCES).categories.projects.look).toBe("left-border");
  });

  it("updates every card at once when the color or opacity changes, fading only the background", async () => {
    await mountPanel();
    await marksFor("Roles");
    await typeInto(hex(), "#F3A8C7");
    const slider = q<HTMLInputElement>("#lw-ce-opacity");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, "45");
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(previewMarks()).toHaveLength(14);
    expect([...new Set(previewMarks().map((m) => m.style.backgroundColor))]).toEqual(["rgba(243, 168, 199, 0.45)"]);
    // Opacity belongs to the background: the text is never faded.
    expect(previewMarks().every((m) => m.style.opacity === "")).toBe(true);
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
    expect(roles()).toEqual({ enabled: true, color: "pink", look: "solid" });
  });
});

const RULES = [
  { id: "roles", label: "Roles" },
  { id: "numbers", label: "Meaningful Numbers" },
  { id: "impact", label: "Impact" },
  { id: "leadership", label: "Leadership" },
  { id: "skills", label: "Skills & Tools" },
  { id: "achievements", label: "Achievements" },
  { id: "projects", label: "Projects" },
  { id: "languages", label: "Languages" },
  { id: "keywords", label: "Keywords" },
] as const;
const styleOf = (id: (typeof RULES)[number]["id"]) => {
  const prefs = highlightPreferences.getState().value;
  return id === "keywords" ? prefs.keywords : prefs.categories[id];
};
const FIXTURE_PHRASES = [
  "led the development", "10,000+", "40%", "team of 5", "React, Python, and AWS", "1st place",
  "500+", "30%", "TypeScript, React, and Azure", "team of 4", "2 product teams", "Node.js", "AI", "Machine Learning",
];

describe("every highlight rule opens the same full editor", () => {
  it("covers every category the settings know, and Keywords", async () => {
    const { HIGHLIGHT_CATEGORIES } = await import("../../signals/highlightCategories");
    expect(RULES.map((r) => r.id)).toEqual([...HIGHLIGHT_CATEGORIES, "keywords"]);
  });

  it.each(RULES)("$label: the row opens the editor with every control and the full Live Preview", async ({ id, label }) => {
    await mountPanel();
    await act(async () => rowButton(label).click());
    expect(getHighlightRule()).toBe(id);
    expect(q(".lw-rule-detail__title").textContent).toBe(label);
    expect(q(".lw-rule-detail__title svg")).not.toBeNull();
    for (const selector of [".lw-ce__square", ".lw-ce__hue", ".lw-ce__preview", "#lw-ce-hex", ".lw-ce__recent", "#lw-ce-opacity"]) expect(container.querySelector(selector)).not.toBeNull();
    expect(q(".lw-ce__rgb").querySelectorAll("input")).toHaveLength(3);
    expect([...container.querySelectorAll(".lw-live > article")].map((a) => a.getAttribute("aria-label"))).toEqual(["Post example", "Experience example", "Skills example", "Education example"]);
    expect(previewMarks().map((m) => m.textContent)).toEqual(FIXTURE_PHRASES);
    // Only Keywords has its words editor, above the color.
    expect(container.querySelector('[aria-label="Custom words"] textarea') !== null).toBe(id === "keywords");

    sendMessage.mockClear();
    await typeInto(hex(), "#4F46E5");
    expect(styleOf(id).custom?.hex).toBe("#4F46E5");
    expect(new Set(previewMarks().map((m) => m.style.backgroundColor)).size).toBe(1);
    expect(previewMarks()[0]!.style.backgroundColor).toBe(`rgba(79, 70, 229, ${editableOpacity(id)})`);
    await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    // The row's dot shows the new color at once.
    const row = [...container.querySelectorAll(".lw-rule")].find((r) => r.querySelector(".lw-rule__name")?.textContent === label)!;
    expect(row.querySelector<HTMLElement>(".lw-dot__button")!.style.backgroundColor).toBe("rgb(79, 70, 229)");
    await act(async () => rowButton(label).click());
    expect(hex().value).toBe("#4F46E5");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it.each(RULES.filter((r) => r.id !== "keywords"))("$label: still opens while Signal Mode is off", async ({ id, label }) => {
    setSignalModeEnabled(false);
    await mountPanel();
    const row = [...container.querySelectorAll(".lw-rule")].find((r) => r.querySelector(".lw-rule__name")?.textContent === label)!;
    expect(row.classList.contains("lw-rule--disabled")).toBe(true);
    await act(async () => row.querySelector<HTMLButtonElement>(".lw-rule__name")!.click());
    expect(getHighlightRule()).toBe(id);
    expect(previewMarks()).toHaveLength(FIXTURE_PHRASES.length);
  });

  it("keeps every rule's highlight style apart", async () => {
    await mountPanel();
    const LOOK_LABELS = ["Solid", "Soft", "Underline", "Text Color", "Dashed", "Left Border"];
    const picks = RULES.map((r, i) => [r.label, LOOK_LABELS[i % LOOK_LABELS.length]!] as const);
    for (const [label, look] of picks) {
      await openCategory(label);
      await act(async () => [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Highlight style"] [role="radio"]')].find((b) => b.textContent?.includes(look))!.click());
      await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    }
    for (const [label, look] of picks) {
      await openCategory(label);
      expect(container.querySelector('[aria-label="Highlight style"] [aria-checked="true"]')!.textContent).toContain(look);
      await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    }
    expect(RULES.map((r) => styleOf(r.id).look)).toEqual(["solid", "soft", "underline", "text", "dashed", "left-border", "solid", "soft", "underline"]);
  });

  it("keeps every rule's color and opacity apart", async () => {
    await mountPanel();
    const picks: [string, string, string][] = [["Roles", "#EF4444", "60"], ["Skills & Tools", "#3B82F6", "30"], ["Projects", "#A855F7", "45"], ["Languages", "#22C55E", "25"], ["Keywords", "#F97316", "55"]];
    for (const [label, color, opacity] of picks) {
      await openCategory(label);
      await typeInto(hex(), color);
      const slider = q<HTMLInputElement>("#lw-ce-opacity");
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, opacity);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    }
    for (const [label, color, opacity] of picks) {
      await openCategory(label);
      expect([hex().value, q<HTMLInputElement>("#lw-ce-opacity").value]).toEqual([color, opacity]);
      await act(async () => q<HTMLButtonElement>('[aria-label="Back to highlighting"]').click());
    }
    // The untouched ones keep their presets.
    expect(styleOf("impact").custom).toBeUndefined();
    expect(styleOf("numbers").custom).toBeUndefined();
  });
});

describe("stored custom colors", () => {
  it("restore after a reload, and a broken value falls back to the preset", () => {
    const restored = readHighlightPreferences({
      [HIGHLIGHT_PREFERENCES_STORAGE_KEY]: {
        categories: { roles: { enabled: true, color: "blue", look: "dashed", custom: { hex: "#facc15", opacity: 0.35 } }, skills: { color: "sky", custom: { hex: "nope", opacity: 1 } } },
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
