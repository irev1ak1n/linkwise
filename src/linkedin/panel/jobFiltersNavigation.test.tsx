// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EMPTY_PROFILE } from "../../models/profile";
import { DEFAULT_JOBS_SETTINGS } from "../../models/jobsSettings";
import { PanelApp } from "./PanelApp";
import { setPanelProfileData } from "./panelStore";
import { getJobsSettingsState, setJobsSettings, subscribeJobsSettingsStore } from "./jobsSettingsStore";
import { panelToolPreference } from "../../optimizer/optimizerPreferences";
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

const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
const radio = (group: string, text: string) =>
  [...container.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] button`)].find((b) => b.textContent === text) as HTMLButtonElement;

installChrome();

beforeEach(() => {
  panelToolPreference.set("analyzer");
  setJobsSettings(DEFAULT_JOBS_SETTINGS);
  for (const key of Object.keys(stored)) delete stored[key];
  set.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("Job Filters navigation", () => {
  it("keeps job controls off the profile page and opens them as their own page", async () => {
    await mountPanel();
    expect(container.textContent).not.toContain("Applied jobs");
    expect(container.textContent).not.toContain("Keyword filters");
    await act(async () => button("Job Filters").click());
    expect(container.textContent).toContain("Customize how LinkedIn job listings are hidden or highlighted.");
    expect(container.textContent).toContain("Applied jobs");
    expect(container.textContent).toContain("Case-insensitive matching");
  });

  it("returns to the profile tool with its state, via Back", async () => {
    await mountPanel();
    const before = container.querySelector(".lw-panel__body")!.textContent;
    await act(async () => button("Job Filters").click());
    await act(async () => button("← Back").click());
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("Profile Analyzer");
    expect(container.querySelector(".lw-panel__body")!.textContent).toBe(before);
  });

  it("updates and saves the shared jobs settings, with a color choice only for Highlight", async () => {
    await mountPanel();
    await act(async () => button("Job Filters").click());
    expect(container.querySelector('[aria-label="Viewed jobs color"]')).toBeNull();
    await act(async () => radio("Viewed jobs", "Highlight").click());
    expect(getJobsSettingsState().settings.viewedAction).toBe("highlight");
    expect(container.querySelector('[aria-label="Viewed jobs color"]')).not.toBeNull();
    expect(set).toHaveBeenCalledWith({ "finder.jobsSettings.v1": expect.objectContaining({ viewedAction: "highlight" }) });
    expect(container.textContent).toContain("Highlight viewed jobs");
  });

  it("remembers the open tool across panel reopenings", async () => {
    await mountPanel();
    await act(async () => button("Job Filters").click());
    expect(stored["finder.panelTool.v1"]).toBe("jobs");
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

describe("Smart Highlights separation", () => {
  it("keeps highlight controls out of Profile Analyzer and on their own page", async () => {
    await mountPanel();
    expect(container.textContent).not.toContain("Signal Mode");
    expect(container.textContent).not.toContain("Highlight keywords");
    await act(async () => button("Smart Highlights").click());
    expect(container.textContent).toContain("Signal Mode");
    expect(container.querySelector(".lw-signals")).not.toBeNull();
  });

  it("still turns Signal Mode on from its own page", async () => {
    const { getSignalModeState } = await import("./signalModeStore");
    await mountPanel();
    await act(async () => button("Smart Highlights").click());
    const toggle = container.querySelector<HTMLInputElement>(".lw-signals__toggle input")!;
    const before = getSignalModeState().enabled;
    await act(async () => toggle.click());
    expect(getSignalModeState().enabled).toBe(!before);
  });
});
