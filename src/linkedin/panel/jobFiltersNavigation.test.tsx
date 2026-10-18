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
    expect(menuItems()).toEqual(["Profile Analyzer", "Profile Optimizer", "Job Filters", "Saved Profiles"]);
    expect(container.querySelector(".lw-menu")!.children).toHaveLength(4);
    expect(container.textContent).not.toContain("Smart Highlights");
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it("shows the tool list only on the menu, and every tool leads back to it", async () => {
    await mountPanel();
    for (const label of ["Profile Analyzer", "Profile Optimizer", "Job Filters", "Saved Profiles"]) {
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
    await openFromMenu("Job Filters");
    expect(stored["finder.panelTool.v1"]).toBe("jobs");
  });

  it("opens an old Smart Highlights choice in Profile Analyzer", () => {
    expect(decodePanelTool("highlights")).toBe("analyzer");
    expect(decodePanelTool("menu")).toBe("menu");
    expect(decodePanelTool("nonsense")).toBeUndefined();
  });
});

describe("Job Filters page", () => {
  it("keeps job controls off the profile page and opens them as their own page", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    expect(container.textContent).not.toContain("Applied jobs");
    await toMenu();
    await openFromMenu("Job Filters");
    expect(container.textContent).toContain("Customize how LinkedIn job listings are hidden or highlighted.");
    expect(container.textContent).toContain("Applied jobs");
    expect(container.textContent).toContain("Case-insensitive matching");
  });

  it("updates and saves the shared jobs settings, with a color choice only for Highlight", async () => {
    await mountPanel();
    await openFromMenu("Job Filters");
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
    const hero = container.querySelector(".lw-tool-head--hero")!;
    expect(hero.textContent).not.toContain("Back to Menu");
    expect(hero.querySelector('[aria-label="Open LinkWise menu"]')).not.toBeNull();
    expect(hero.querySelector('[aria-label="Open LinkWise settings"]')).not.toBeNull();
    await openSettings();
    expect(stored["finder.panelTool.v1"]).toBe("settings");
    expect(container.querySelector(".lw-tool-head__title")!.textContent).toBe("Settings");
    await toMenu();
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
    expect(container.querySelector('[aria-label="Profile highlights"]')!.textContent).toContain("Signal Mode");
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

describe("Highlight on profile", () => {
  it("puts Highlight on profile right under Looking for, as the only keyword editor", async () => {
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    const focus = container.querySelector('[aria-label="Highlight on profile"]')!;
    expect(focus).not.toBeNull();
    expect(focus.previousElementSibling!.textContent).toMatch(/Who are you looking for|Looking for/);
    expect(focus.nextElementSibling?.className ?? "").not.toContain("lw-hl");
    await act(async () => [...focus.querySelectorAll("button")].find((b) => b.textContent === "Edit")!.click());
    expect(container.querySelectorAll("textarea[placeholder='Python, robotics, volunteer']")).toHaveLength(1);
  });

  it("saves Highlight on profile locally, without touching the goal, the analysis, or AI", async () => {
    const { getGoalStoreState } = await import("./goalStore");
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    const goalBefore = JSON.stringify(getGoalStoreState());
    const sendMessage = (globalThis as unknown as { chrome: { runtime: { sendMessage: ReturnType<typeof vi.fn> } } }).chrome.runtime.sendMessage;
    sendMessage.mockClear();
    const focus = () => container.querySelector('[aria-label="Highlight on profile"]')!;
    await act(async () => [...focus().querySelectorAll("button")].find((b) => b.textContent === "Edit")!.click());
    const textarea = focus().querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Python, TSA");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => [...focus().querySelectorAll("button")].find((b) => b.textContent === "Save")!.click());
    expect(stored["finder.highlightKeywords.v1"]).toBe("Python, TSA");
    expect(focus().textContent).toContain("Python, TSA");
    expect(JSON.stringify(getGoalStoreState())).toBe(goalBefore);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("turns Signal Mode on from Settings", async () => {
    const { getSignalModeState } = await import("./signalModeStore");
    await mountPanel();
    await openFromMenu("Profile Analyzer");
    await openSettings();
    const toggle = container.querySelector<HTMLInputElement>(".lw-signals__toggle input")!;
    const before = getSignalModeState().enabled;
    await act(async () => toggle.click());
    expect(getSignalModeState().enabled).toBe(!before);
  });
});
