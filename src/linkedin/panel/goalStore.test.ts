// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "../../models/goal";

type StorageChange = { oldValue?: unknown; newValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, areaName: string) => void;

/** A minimal fake of the two chrome.storage.local pieces goalStore.ts actually uses — enough to
 * prove the store reacts to a real chrome.storage.onChanged event the way a second copy of this
 * same panel's writes would trigger it, without needing a real browser. */
function installFakeChromeStorage(initial: Record<string, unknown>) {
  const data: Record<string, unknown> = { ...initial };
  const listeners: ChangeListener[] = [];

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (keys: string | string[]) =>
          Promise.resolve(
            (Array.isArray(keys) ? keys : [keys]).reduce<Record<string, unknown>>((acc, key) => {
              if (key in data) acc[key] = data[key];
              return acc;
            }, {}),
          ),
        set: (items: Record<string, unknown>) => {
          const changes: Record<string, StorageChange> = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: data[key], newValue: value };
            data[key] = value;
          }
          listeners.forEach((listener) => listener(changes, "local"));
          return Promise.resolve();
        },
      },
      onChanged: {
        addListener: (listener: ChangeListener) => listeners.push(listener),
        removeListener: (listener: ChangeListener) => {
          const index = listeners.indexOf(listener);
          if (index !== -1) listeners.splice(index, 1);
        },
      },
    },
  };
}

function goal(id: string, name: string): Goal {
  return { id, name, criteria: [] };
}

async function waitUntil(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timed out");
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("goalStore", () => {
  beforeEach(() => {
    // goalStore.ts keeps module-level state — force a fresh module instance per test so one
    // test's chrome.storage.onChanged subscription never leaks into the next.
    vi.resetModules();
  });

  it("loads the initially-selected goal on init", async () => {
    installFakeChromeStorage({
      "finder.goalsSeeded.v1": true,
      "finder.goals.v1": [goal("g1", "Goal A"), goal("g2", "Goal B")],
      "finder.selectedGoalId.v1": "g1",
    });

    const { initGoalStore, getGoalStoreState, selectActiveGoal } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    expect(selectActiveGoal(getGoalStoreState())?.name).toBe("Goal A");
  });

  it("picks up a goal switch made elsewhere via chrome.storage.onChanged, with no re-collection involved", async () => {
    installFakeChromeStorage({
      "finder.goalsSeeded.v1": true,
      "finder.goals.v1": [goal("g1", "Goal A"), goal("g2", "Goal B")],
      "finder.selectedGoalId.v1": "g1",
    });

    const { initGoalStore, getGoalStoreState, selectActiveGoal } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);
    expect(selectActiveGoal(getGoalStoreState())?.name).toBe("Goal A");

    await chrome.storage.local.set({ "finder.selectedGoalId.v1": "g2" });
    await waitUntil(() => selectActiveGoal(getGoalStoreState())?.name === "Goal B");

    expect(selectActiveGoal(getGoalStoreState())?.id).toBe("g2");
  });

  it("picks up an edited criterion for the currently-active goal", async () => {
    const goalA: Goal = { id: "g1", name: "Goal A", criteria: [{ id: "c1", label: "Python", importance: "MUST_HAVE" }] };
    installFakeChromeStorage({
      "finder.goalsSeeded.v1": true,
      "finder.goals.v1": [goalA],
      "finder.selectedGoalId.v1": "g1",
    });

    const { initGoalStore, getGoalStoreState, selectActiveGoal } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);
    expect(selectActiveGoal(getGoalStoreState())?.criteria[0].label).toBe("Python");

    const updatedGoalA: Goal = { ...goalA, criteria: [{ id: "c1", label: "Java", importance: "MUST_HAVE" }] };
    await chrome.storage.local.set({ "finder.goals.v1": [updatedGoalA] });
    await waitUntil(() => selectActiveGoal(getGoalStoreState())?.criteria[0].label === "Java");

    expect(selectActiveGoal(getGoalStoreState())?.criteria[0].label).toBe("Java");
  });

  it("addGoal creates and selects a new goal immediately, without waiting on a storage round-trip", async () => {
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [], "finder.selectedGoalId.v1": "" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, addGoal } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    addGoal("Startup founder");

    expect(selectActiveGoal(getGoalStoreState())?.name).toBe("Startup founder");
    expect(getGoalStoreState().goals).toHaveLength(1);
  });

  it("addGoalFromCriteria creates a new goal without touching any existing one", async () => {
    const existing = goal("g1", "Existing goal");
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [existing], "finder.selectedGoalId.v1": "g1" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, addGoalFromCriteria } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    addGoalFromCriteria("From draft", [{ label: "Python", importance: "MUST_HAVE" }]);

    const state = getGoalStoreState();
    expect(state.goals).toHaveLength(2);
    expect(state.goals.find((g) => g.id === "g1")).toEqual(existing);
    expect(selectActiveGoal(state)?.name).toBe("From draft");
    expect(selectActiveGoal(state)?.criteria[0].label).toBe("Python");
  });

  it("addCriterion/updateCriterion/removeCriterion mutate only the targeted goal and criterion", async () => {
    installFakeChromeStorage({
      "finder.goalsSeeded.v1": true,
      "finder.goals.v1": [goal("g1", "Goal A")],
      "finder.selectedGoalId.v1": "g1",
    });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, addCriterion, updateCriterion, removeCriterion } =
      await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    addCriterion("g1", "Python", "MUST_HAVE");
    const added = selectActiveGoal(getGoalStoreState())!.criteria[0];
    expect(added.label).toBe("Python");

    updateCriterion("g1", added.id, { label: "Java" });
    expect(selectActiveGoal(getGoalStoreState())!.criteria[0].label).toBe("Java");

    removeCriterion("g1", added.id);
    expect(selectActiveGoal(getGoalStoreState())!.criteria).toHaveLength(0);
  });

  it("removeGoal falls back to selecting another remaining goal when the active one is removed", async () => {
    installFakeChromeStorage({
      "finder.goalsSeeded.v1": true,
      "finder.goals.v1": [goal("g1", "Goal A"), goal("g2", "Goal B")],
      "finder.selectedGoalId.v1": "g1",
    });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, removeGoal } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    removeGoal("g1");

    expect(getGoalStoreState().goals).toHaveLength(1);
    expect(selectActiveGoal(getGoalStoreState())?.id).toBe("g2");
  });

  it("setActiveGoalCriteria updates the currently-active goal in place rather than creating a new one", async () => {
    const existing = goal("g1", "Old name");
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [existing], "finder.selectedGoalId.v1": "g1" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, setActiveGoalCriteria } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    setActiveGoalCriteria("FRC Mentors", [
      { label: "FRC mentor", importance: "MUST_HAVE", category: "role" },
      { label: "Charlotte", importance: "PREFERRED", category: "location" },
    ]);

    const state = getGoalStoreState();
    expect(state.goals).toHaveLength(1); // still one goal — updated in place, not a new one
    const active = selectActiveGoal(state);
    expect(active?.id).toBe("g1");
    expect(active?.name).toBe("FRC Mentors");
    expect(active?.criteria.map((c) => c.label)).toEqual(["FRC mentor", "Charlotte"]);
    expect(active?.criteria[0].category).toBe("role");
  });

  it("setActiveGoalCriteria creates a goal when none is active yet", async () => {
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [], "finder.selectedGoalId.v1": "" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, setActiveGoalCriteria } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    setActiveGoalCriteria("My search", [{ label: "Python", importance: "MUST_HAVE" }]);

    const state = getGoalStoreState();
    expect(state.goals).toHaveLength(1);
    expect(selectActiveGoal(state)?.name).toBe("My search");
  });

  it("updateGoalNotes persists notes on the goal without touching its criteria", async () => {
    const existing: Goal = { id: "g1", name: "Goal A", criteria: [{ id: "c1", label: "Python", importance: "MUST_HAVE" }] };
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [existing], "finder.selectedGoalId.v1": "g1" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, updateGoalNotes } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    updateGoalNotes("g1", "Met at a career fair, follow up next week.");

    const active = selectActiveGoal(getGoalStoreState());
    expect(active?.notes).toBe("Met at a career fair, follow up next week.");
    expect(active?.criteria).toHaveLength(1);
  });
});
