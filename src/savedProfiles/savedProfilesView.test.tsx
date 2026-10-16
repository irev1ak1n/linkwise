// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnalysisView } from "../linkedin/panel/AnalysisView";
import { openAnalyzerPage } from "../linkedin/panel/analyzerNav";
import { scoreProfileAgainstGoal } from "../matching/scoreProfile";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import type { Goal } from "../models/goal";
import type { AiAnalysisState } from "../linkedin/panel/useAiAnalysis";
import { SavedProfilesView } from "./SavedProfilesView";
import { openSavedPage } from "./savedNav";
import { resetSavedProfilesStore } from "./savedProfilesStore";
import { savedProfileStorageKey } from "../storage/savedProfilesRepository";
import type { SavedProfile } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let data: Record<string, unknown>;
let root: Root | null = null;
let container: HTMLElement;
const sendMessage = vi.fn();

beforeEach(() => {
  data = {};
  sendMessage.mockClear();
  resetSavedProfilesStore();
  openAnalyzerPage("home");
  openSavedPage({ page: "list" });
  const listeners: ((changes: Record<string, unknown>, area: string) => void)[] = [];
  vi.stubGlobal("chrome", {
    runtime: { id: "test", sendMessage },
    storage: {
      onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l), removeListener: () => {} },
      local: {
        get: (keys: string | string[] | null) => {
          if (keys === null) return Promise.resolve(structuredClone(data));
          const list = Array.isArray(keys) ? keys : [keys];
          return Promise.resolve(Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])));
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          listeners.forEach((l) => l(Object.fromEntries(Object.keys(items).map((k) => [k, { newValue: items[k] }])), "local"));
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
          listeners.forEach((l) => l(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, {}])), "local"));
          return Promise.resolve();
        },
      },
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const goal: Goal = { id: "g1", name: "Developers", description: "", criteria: [{ id: "c1", label: "Software development", importance: "MUST_HAVE" }] };
const profile: LinkedInProfile = { ...EMPTY_PROFILE, name: "Jordan Rivera", headline: "Software developer", extracted: true };
const result = scoreProfileAgainstGoal(goal, profile);
const unavailable = { status: "unavailable", reason: "timeout" } as Extract<AiAnalysisState, { status: "unavailable" }>;

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => await new Promise((r) => setTimeout(r, 0)));
};
const click = (text: string) => {
  const target = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!target) throw new Error(`No button "${text}"`);
  act(() => target.click());
};

describe("Save profile", () => {
  it("saves once, then shows Saved, with no request to the backend", async () => {
    act(() => root!.render(<AnalysisView profileKey="jordan-rivera" result={result} goal={goal} profile={profile} aiState={unavailable} />));
    await flush();
    click("Save profile");
    await flush();
    expect(container.textContent).toContain("✓ Saved");
    expect(container.textContent).not.toContain("Save profile");
    const saved = data[savedProfileStorageKey("jordan-rivera")] as SavedProfile;
    expect(saved).toMatchObject({ profileKey: "jordan-rivera", profileName: "Jordan Rivera", history: [{ origin: "saved", goal: { id: "g1" } }] });
    expect(saved.history[0]!.analysis?.matchScore).toBe(result.scorePercent);
    expect(Object.keys(data).filter((k) => k.startsWith("finder.savedProfile"))).toHaveLength(1);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("Saved Profiles pages", () => {
  const change = { id: "c", kind: "added" as const, section: "certifications" as const, significance: "meaningful" as const, direction: "improved" as const, title: "New certification", subject: "AWS Certified Cloud Practitioner" };
  const savedProfile: SavedProfile = {
    profileKey: "jordan-rivera",
    profileName: "Jordan Rivera",
    profileUrl: "https://www.linkedin.com/in/jordan-rivera/",
    savedAt: Date.UTC(2026, 9, 15, 12),
    lastCheckedAt: Date.UTC(2026, 9, 20, 12),
    history: [
      { recordedAt: Date.UTC(2026, 9, 20, 12), origin: "check", profile, completeSections: [], goal: null, analysis: { matchScore: 84, recommendation: "Worth contacting", summary: "Jordan builds software.", strengths: [], gaps: [], criteria: [], source: "ai" }, changes: [change] },
      { recordedAt: Date.UTC(2026, 9, 15, 12), origin: "saved", profile, completeSections: [], goal: null, analysis: { matchScore: 72, recommendation: "Consider", summary: "", strengths: [], gaps: [], criteria: [], source: "ai" }, changes: [] },
    ],
    lastCheck: {
      checkedAt: Date.UTC(2026, 9, 20, 12),
      baselineRecordedAt: Date.UTC(2026, 9, 15, 12),
      evidenceHash: "h",
      changes: [change],
      unchecked: 0,
      impact: { previous: 72, current: 84, delta: 12, sameGoal: true, previousGoalName: "Developers", explanations: ["Software development: evidence became stronger with new certification (AWS Certified Cloud Practitioner)."] },
      analysis: { matchScore: 84, recommendation: "Worth contacting", summary: "Jordan builds software.", strengths: ["Software work"], gaps: [], criteria: [], source: "ai" },
    },
    notes: "",
  };

  it("lists saved people and opens one with changes, Match, analysis and history, all from storage", async () => {
    data[savedProfileStorageKey("jordan-rivera")] = savedProfile;
    act(() => root!.render(<SavedProfilesView />));
    await flush();
    expect(container.textContent).toContain("84% match · 1 change · Last checked Oct 20");
    click("Jordan Rivera");
    const text = container.textContent!;
    expect(text).toContain("1 meaningful change since Oct 15");
    expect(text).toContain("New certification");
    expect(text).toContain("AWS Certified Cloud Practitioner");
    expect(text).toContain("+12");
    expect(text).toContain("evidence became stronger with new certification");
    expect(text).toContain("Worth contacting");
    expect(container.querySelectorAll(".lw-sp-history > li")).toHaveLength(2);
    expect(container.querySelector(".lw-sp-change.is-improved")).not.toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("removes a saved profile", async () => {
    data[savedProfileStorageKey("jordan-rivera")] = savedProfile;
    act(() => root!.render(<SavedProfilesView />));
    await flush();
    click("Jordan Rivera");
    click("Remove from saved");
    await flush();
    expect(data[savedProfileStorageKey("jordan-rivera")]).toBeUndefined();
    expect(container.textContent).toContain("No saved profiles yet");
  });
});
