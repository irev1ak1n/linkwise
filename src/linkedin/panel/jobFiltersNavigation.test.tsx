// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EMPTY_PROFILE } from "../../models/profile";
import { DEFAULT_JOBS_SETTINGS } from "../../models/jobsSettings";
import { PanelApp } from "./PanelApp";
import { setPanelProfileData } from "./panelStore";
import { getJobsSettingsState, setJobsSettings, subscribeJobsSettingsStore } from "./jobsSettingsStore";
import { decodePanelTool, panelToolPreference } from "../../optimizer/optimizerPreferences";
import { resetJobsRuntime, runJobsTick } from "../jobs/jobsRuntime";
import { resetHighlightRuleForTests, resetSettingsOriginForTests } from "./settingsNav";
import { getOptimizerPage, openOptimizerPage } from "../../optimizer/optimizerNav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stored: Record<string, unknown> = {};
const set = vi.fn((items: Record<string, unknown>) => {
  Object.assign(stored, items);
  return Promise.resolve();
});

function installChrome(): void {
  vi.stubGlobal("chrome", {
    runtime: { id: "test", sendMessage: vi.fn(), lastError: undefined },
    storage: {
      local: {
        get: (keys: string | string[] | null) => {
          const list = keys === null ? Object.keys(stored) : Array.isArray(keys) ? keys : [keys];
          return Promise.resolve(Object.fromEntries(list.filter((k) => k in stored).map((k) => [k, stored[k]])));
        },
        set,
        remove: () => Promise.resolve(),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  });
}

let root: Root | null = null;
let container: HTMLElement;

async function mountPanel() {
  setPanelProfileData({
    profileKey: "jordan",
    profile: { ...EMPTY_PROFILE, name: "Jordan Rivera", headline: "Student developer", extracted: true },
    collection: null,
    autoScanProgress: null,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<PanelApp onClose={() => {}} />));
  await act(async () => {});
}

const radio = (group: string, text: string) =>
  [...container.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] button`)].find((b) => b.textContent === text) as HTMLButtonElement;

installChrome();

beforeEach(() => {
  panelToolPreference.set("menu");
  resetSettingsOriginForTests();
  resetHighlightRuleForTests();
  setJobsSettings(DEFAULT_JOBS_SETTINGS);
  for (const key of Object.keys(stored)) delete stored[key];
  set.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

const menuItems = () => [...container.querySelectorAll(".lw-menu .lw-menu__item .lw-opt-card__title")].map((el) => el.textContent);
const openFromMenu = async (label: string) => act(async () => [...container.querySelectorAll<HTMLButtonElement>(".lw-menu__item")].find((b) => b.textContent?.includes(label))!.click());
// Tool pages with the hero go back through its menu button; the others through "Back to Menu".
const toMenu = async () =>
  act(async () => (container.querySelector<HTMLButtonElement>('[aria-label="Open LinkWise menu"]') ?? [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "← Back to Menu")!).click());
const openSettings = async () => act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Open LinkWise settings"]')!.click());

describe("LinkWise menu", () => {
  it("lists exactly the four tools, one per row, with no Smart Highlights or tab bar", async () => {
    await mountPanel();
    expect(menuItems()).toEqual(["Profile Analyzer", "Profile Optimizer", "Job Analyzer", "Saved Profiles"]);
    expect(container.querySelector(".lw-menu")!.children).toHaveLength(4);
    expect(container.textContent).not.toContain("Smart Highlights");
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it("shows the tool list only on the menu, and every tool leads back to it", async () => {
    await mountPanel();
    for (const label of ["Profile Analyzer", "Profile Optimizer", "Job Analyzer", "Saved Profiles"]) {
      await openFromMenu(label);
      expect(container.querySelector(".lw-menu")).toBeNull();
      await toMenu();
      expect(menuItems()).toHaveLength(4);
    }
  });

  it("keeps a tool's state when leaving for the menu and coming back", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    const before = container.querySelector(".lw-panel__body")!.textContent;
    await toMenu();
    await openFromMenu("Profile Analyzer");
    expect(container.querySelector(".lw-panel__body")!.textContent).toBe(before);
  });

  it("remembers the open tool across panel reopenings", async () => {
    await mountPanel();
    await openFromMenu("Job Analyzer");
    expect(stored["finder.panelTool.v1"]).toBe("jobs");
  });

  it("opens an old Smart Highlights choice in Profile Analyzer", () => {
    expect(decodePanelTool("highlights")).toBe("analyzer");
    expect(decodePanelTool("menu")).toBe("menu");
    expect(decodePanelTool("nonsense")).toBeUndefined();
  });
});

describe("Job filters in Settings", () => {
  it("keeps job controls off the analyzer pages and puts them in Settings", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    expect(container.textContent).not.toContain("Applied jobs");
    await toMenu();
    await openFromMenu("Job Analyzer");
    expect(container.textContent).toContain("Job Analyzer");
    expect(container.textContent).not.toContain("Applied jobs");
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    await openSettings();
    expect(container.textContent).toContain("Job filters");
    expect(container.textContent).toContain("Customize how LinkedIn job listings are hidden or highlighted.");
    expect(container.textContent).toContain("Applied jobs");
    expect(container.textContent).toContain("Case-insensitive matching");
  });

  it("updates and saves the shared jobs settings, with a color choice only for Highlight", async () => {
    await mountPanel();
    await openFromMenu("Job Analyzer");
    await openSettings();
    expect(container.querySelector('[aria-label="Viewed jobs color"]')).toBeNull();
    await act(async () => radio("Viewed jobs", "Highlight").click());
    expect(getJobsSettingsState().settings.viewedAction).toBe("highlight");
    expect(container.querySelector('[aria-label="Viewed jobs color"]')).not.toBeNull();
    expect(set).toHaveBeenCalledWith({ "finder.jobsSettings.v1": expect.objectContaining({ viewedAction: "highlight" }) });
  });
});

describe("job cards and the settings store", () => {
  it("restyle visible cards as soon as a setting changes", async () => {
    resetJobsRuntime();
    document.body.innerHTML = `<li data-occludable-job-id="1"><a href="/jobs/view/1/"><span>A</span></a><ul><li class="job-card-container__footer-job-state">Viewed</li></ul></li>`;
    const tick = () => runJobsTick("https://www.linkedin.com/jobs/search/", getJobsSettingsState().settings);
    const unsubscribe = subscribeJobsSettingsStore(tick);
    setJobsSettings({ ...getJobsSettingsState().settings, viewedAction: "hide" });
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
    setJobsSettings({ ...getJobsSettingsState().settings, viewedAction: "none" });
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(false);
    unsubscribe();
  });
});

describe("Settings", () => {
  it("replaces Back to Menu on the Analyzer hero with a menu button and a settings button", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    const hero = container.querySelector(".lw-art-hero--analyzer")!;
    expect(hero.textContent).not.toContain("Back to Menu");
    expect(hero.querySelector("img")!.getAttribute("alt")).toContain("Profile Analyzer");
    expect(hero.querySelector('[aria-label="Open LinkWise menu"]')).not.toBeNull();
    expect(hero.querySelector('[aria-label="Open LinkWise settings"]')).not.toBeNull();
    await openSettings();
    expect(stored["finder.panelTool.v1"]).toBe("settings");
    expect(container.querySelector(".lw-art-hero--settings h2")!.textContent).toBe("Settings");
    await toMenu();
    expect(menuItems()).toHaveLength(4);
  });

  it("shows the artwork hero with live title text, and Back then Menu as its two controls", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    const hero = container.querySelector(".lw-art-hero--settings")!;
    expect([...hero.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"))).toEqual(["Go back", "Open LinkWise menu"]);
    expect(hero.querySelector("h2")!.textContent).toBe("Settings");
    expect(hero.querySelector("p")!.textContent).toBe("Customize scanning, highlights, and preferences.");
    expect(container.querySelectorAll("h2")).toHaveLength(1);
    expect(container.querySelector(".lw-tool-head__title")).toBeNull();
  });

  const goBack = async () => act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Go back"]')!.click());

  it("goes back to the Analyzer it was opened from, and to the menu from the menu", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    await goBack();
    expect(stored["finder.panelTool.v1"]).toBe("analyzer");
    expect(container.querySelector(".lw-art-hero--analyzer")).not.toBeNull();
    await openSettings();
    await toMenu();
    expect(menuItems()).toHaveLength(4);
    const { openSettings: openFromAnywhere } = await import("./settingsNav");
    await act(async () => openFromAnywhere());
    await goBack();
    expect(menuItems()).toHaveLength(4);
  });

  it("returns to the exact Optimizer page it was opened from", async () => {
    const { openSettings: openFromAnywhere } = await import("./settingsNav");
    await mountPanel();
    await openFromMenu("Profile Optimizer");
    await act(async () => openOptimizerPage({ name: "section", section: "headline" }));
    await act(async () => openFromAnywhere());
    expect(stored["finder.panelTool.v1"]).toBe("settings");
    await goBack();
    expect(stored["finder.panelTool.v1"]).toBe("optimizer");
    expect(getOptimizerPage()).toEqual({ name: "section", section: "headline" });
    await act(async () => openOptimizerPage({ name: "home" }));
  });

  it("keeps the first origin when Settings is opened again from Settings", async () => {
    const { openSettings: openFromAnywhere } = await import("./settingsNav");
    await mountPanel();
    await openFromMenu("Job Analyzer");
    await act(async () => openFromAnywhere());
    await act(async () => openFromAnywhere());
    await goBack();
    expect(stored["finder.panelTool.v1"]).toBe("jobs");
  });

  it("falls back to the menu when nothing opened it, such as after a reload", async () => {
    panelToolPreference.set("settings");
    await mountPanel();
    await goBack();
    expect(menuItems()).toHaveLength(4);
  });

  it("holds the scan and highlight settings, which the Analyzer no longer shows", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    expect(container.querySelector('[aria-label="Scan mode"]')).toBeNull();
    expect(container.querySelector('[aria-label="Profile highlights"]')).toBeNull();
    expect(container.textContent).not.toContain("Scan settings");
    await openSettings();
    expect(container.querySelectorAll('[aria-label="Scan mode"]')).toHaveLength(1);
    expect(container.querySelectorAll('[aria-label="Profile highlights"]')).toHaveLength(1);
    expect(container.querySelector('[aria-label="Scanning"]')!.textContent).toContain("Scan mode");
    expect(container.querySelector('[aria-label="Profile highlights"]')!.textContent).toContain("Smart Highlights");
    expect(container.querySelector('[aria-label="Highlight on profile"]')).toBeNull();
  });

  it("changes the same stored scan mode, without asking AI for anything", async () => {
    const { getScanModeState } = await import("./scanModeStore");
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    const sendMessage = (globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.runtime.sendMessage;
    sendMessage.mockClear();
    await openSettings();
    const other = [...container.querySelectorAll<HTMLButtonElement>('[aria-label="Scan mode"] [role="radio"]')].find((b) => b.getAttribute("aria-checked") === "false")!;
    await act(async () => other.click());
    expect(getScanModeState().mode).toBe(other.textContent === "Auto scan profile" ? "auto" : "scroll");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("opens an old stored Settings choice", () => {
    expect(decodePanelTool("settings")).toBe("settings");
  });
});

describe("Highlighting settings", () => {
  const sendMessage = () => (globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.runtime.sendMessage;
  const highlights = () => container.querySelector('[aria-label="Profile highlights"]')!;
  const rowButton = (label: string) => highlights().querySelector<HTMLButtonElement>(`[aria-label="${label} settings"]`)!;
  const button = (text: string) => [...highlights().querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text)!;
  async function type(value: string) {
    const textarea = highlights().querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("leaves Profile Analyzer without any keyword editor: Looking for goes straight to the next block", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    expect(container.querySelector('[aria-label="Highlight on profile"]')).toBeNull();
    expect(container.querySelector(".lw-focus, .lw-focus-edit")).toBeNull();
    expect(container.textContent).not.toMatch(/Highlight on profile|Add specific words or phrases/);
    expect(container.querySelector("textarea[placeholder='Python, robotics, volunteer']")).toBeNull();
  });

  it("lists every category and Keywords last, as rows of one grouped list with no subtitles", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    const lists = highlights().querySelectorAll("ul");
    expect(lists).toHaveLength(1);
    const rows = [...lists[0]!.querySelectorAll(":scope > li .lw-rule__name")].map((el) => el.textContent);
    expect(rows).toEqual(["Roles", "Meaningful Numbers", "Impact", "Leadership", "Skills & Tools", "Achievements", "Projects", "Languages", "Keywords"]);
    expect(highlights().textContent).not.toMatch(/Auto categories|Custom rules/i);
    expect(highlights().querySelector(".lw-rules__label")!.textContent).toBe("Highlight categories");
    // Chevrons are icons, not text glyphs.
    for (const more of highlights().querySelectorAll(".lw-rule__more")) expect(more.querySelector("svg") && more.textContent === "").toBe(true);
    const row = highlights().querySelector(".lw-rules .lw-rule")!;
    expect(row.querySelectorAll("p")).toHaveLength(0);
    expect(row.querySelector(".lw-dot__button")).not.toBeNull();
    expect(row.querySelector('[role="switch"]')).not.toBeNull();
    // The old single Signal color is gone.
    expect(highlights().textContent).not.toContain("Signal color");
  });

  it("keeps an existing keyword list and edits it in Settings: Save only on a real change, Cancel keeps it, no AI", async () => {
    stored["finder.highlightKeywords.v1"] = "Python, robotics";
    const { highlightKeywordsPreference } = await import("./keywordPreference");
    highlightKeywordsPreference.set("Python, robotics");
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    sendMessage().mockClear();
    set.mockClear();
    await act(async () => rowButton("Keywords").click());
    expect(highlights().querySelector("textarea")!.value).toBe("Python, robotics");
    expect(highlights().textContent).not.toContain("Comma or newline separated");
    expect(button("Save").disabled).toBe(true);
    await type(" python\nROBOTICS ");
    expect(button("Save").disabled).toBe(true);
    await type("Python, robotics, volunteer");
    expect(button("Save").disabled).toBe(false);
    await act(async () => button("Cancel").click());
    expect(stored["finder.highlightKeywords.v1"]).toBe("Python, robotics");
    expect(set).not.toHaveBeenCalled();

    await act(async () => rowButton("Keywords").click());
    expect(highlights().querySelector("textarea")!.value).toBe("Python, robotics");
    await type("Python, TSA ");
    await act(async () => button("Save").click());
    expect(stored["finder.highlightKeywords.v1"]).toBe("Python, TSA");
    expect(button("Save").disabled).toBe(true);
    expect(sendMessage()).not.toHaveBeenCalled();
  });

  it("changes a category's preset color and switch from its row, keeping its other settings, with no AI", async () => {
    (await import("./signalModeStore")).setSignalModeEnabled(true);
    const { highlightPreferences } = await import("./highlightPreferences");
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    sendMessage().mockClear();
    const roles = [...highlights().querySelectorAll(".lw-rule")].find((r) => r.textContent?.includes("Roles"))!;
    await act(async () => roles.querySelector<HTMLButtonElement>(".lw-dot__button")!.click());
    await act(async () => roles.querySelector<HTMLButtonElement>('[aria-label="Pink"]')!.click());
    expect(roles.querySelector(".lw-dot__popover")).toBeNull();
    await act(async () => roles.querySelector<HTMLInputElement>('[role="switch"]')!.click());
    expect(highlightPreferences.getState().value.categories.roles).toEqual({ color: "pink", enabled: false, look: "solid" });
    await act(async () => roles.querySelector<HTMLInputElement>('[role="switch"]')!.click());
    expect(stored["finder.highlightPreferences.v1"]).toBeDefined();
    expect(sendMessage()).not.toHaveBeenCalled();

    await act(async () => button("Reset highlight styles").click());
    expect(highlightPreferences.getState().value.categories.roles).toEqual({ enabled: true, color: "blue", look: "solid" });
  });

  it("closes the color palette with Escape or a click elsewhere", async () => {
    (await import("./signalModeStore")).setSignalModeEnabled(true);
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    const dot = () => highlights().querySelector<HTMLButtonElement>(".lw-dot__button")!;
    await act(async () => dot().click());
    expect(highlights().querySelector(".lw-dot__popover")).not.toBeNull();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(highlights().querySelector(".lw-dot__popover")).toBeNull();
    await act(async () => dot().click());
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true })));
    expect(highlights().querySelector(".lw-dot__popover")).toBeNull();
  });

  it("turns Signal Mode on from Settings, and greys out the automatic categories while it is off", async () => {
    const { getSignalModeState, setSignalModeEnabled } = await import("./signalModeStore");
    setSignalModeEnabled(false);
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    const toggle = () => highlights().querySelector<HTMLInputElement>('input[aria-label="Smart Highlights"]')!;
    expect(highlights().querySelectorAll(".lw-rule--disabled .lw-rule__name")).toHaveLength(8);
    // Keywords are the user's own words, not Signal Mode's, so they stay usable.
    expect([...highlights().querySelectorAll(".lw-rule--row:not(.lw-rule--disabled) .lw-rule__name")].map((e) => e.textContent)).toEqual(["Keywords"]);
    await act(async () => toggle().click());
    expect(getSignalModeState().enabled).toBe(true);
    expect(highlights().querySelectorAll(".lw-rule--disabled")).toHaveLength(0);
  });
});
