// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "../../models/goal";

const generateCriteriaMock = vi.fn();
vi.mock("../../ai/generateCriteria", () => ({
  generateCriteria: (...args: unknown[]) => generateCriteriaMock(...args),
}));

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
    generateCriteriaMock.mockReset();
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

  it("setActiveGoalCriteria persists the description alongside the generated criteria", async () => {
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [], "finder.selectedGoalId.v1": "" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, setActiveGoalCriteria } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    setActiveGoalCriteria("Multilingual Technology Students", [{ label: "Multilingual", importance: "PREFERRED" }], "multilingual technology students");

    expect(selectActiveGoal(getGoalStoreState())?.description).toBe("multilingual technology students");
  });

  it("setActiveGoalCriteria leaves an existing description untouched when called without one", async () => {
    const existing: Goal = { id: "g1", name: "Goal A", criteria: [], description: "original description" };
    installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [existing], "finder.selectedGoalId.v1": "g1" });

    const { initGoalStore, getGoalStoreState, selectActiveGoal, setActiveGoalCriteria } = await import("./goalStore");
    initGoalStore();
    await waitUntil(() => getGoalStoreState().loaded);

    setActiveGoalCriteria("Goal A", [{ label: "Python", importance: "MUST_HAVE" }]);

    expect(selectActiveGoal(getGoalStoreState())?.description).toBe("original description");
  });

  describe("rememberGoalDescription", () => {
    it("persists the description on the active goal without touching its criteria", async () => {
      const existing: Goal = { id: "g1", name: "Goal A", criteria: [{ id: "c1", label: "Python", importance: "MUST_HAVE" }] };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [existing], "finder.selectedGoalId.v1": "g1" });

      const { initGoalStore, getGoalStoreState, selectActiveGoal, rememberGoalDescription } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      rememberGoalDescription("looking for python engineers");

      const active = selectActiveGoal(getGoalStoreState());
      expect(active?.description).toBe("looking for python engineers");
      expect(active?.criteria).toHaveLength(1);
      expect(active?.criteria[0].label).toBe("Python");
    });

    it("does nothing when no goal is active", async () => {
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [], "finder.selectedGoalId.v1": "" });

      const { initGoalStore, getGoalStoreState, rememberGoalDescription } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      rememberGoalDescription("some description");

      expect(getGoalStoreState().goals).toHaveLength(0);
    });
  });

  describe("ensureActiveGoalCriteria — regression coverage for a goal desyncing from its criteria", () => {
    it("regenerates and persists criteria for the exact reported bug: an active goal with a real description but zero scoreable criteria", async () => {
      // Reproduces the live-reported bug verbatim: "Multilingual Technology Students" was the
      // active goal, had a real description, but its criteria array was empty — the deterministic
      // scorer then had nothing to score with and showed "Not enough info" despite everything
      // else (evidence, AI analysis) being present.
      const broken: Goal = { id: "g1", name: "Multilingual Technology Students", criteria: [], description: "multilingual technology students" };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [broken], "finder.selectedGoalId.v1": "g1" });
      generateCriteriaMock.mockResolvedValue({
        name: "Multilingual Technology Students",
        source: "local",
        criteria: [
          { label: "Multilingual", importance: "PREFERRED" },
          { label: "Technology Student Association member", importance: "PREFERRED" },
          { label: "High GPA", importance: "PREFERRED" },
        ],
      });

      const { initGoalStore, getGoalStoreState, selectActiveGoal, ensureActiveGoalCriteria } = await import("./goalStore");
      const { hasScoreableCriteria } = await import("../../models/goal");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);
      expect(hasScoreableCriteria(selectActiveGoal(getGoalStoreState())!)).toBe(false);

      ensureActiveGoalCriteria();
      await waitUntil(() => hasScoreableCriteria(selectActiveGoal(getGoalStoreState())!));

      const active = selectActiveGoal(getGoalStoreState())!;
      expect(active.id).toBe("g1"); // repaired in place, never a new goal
      expect(active.criteria.map((c) => c.label)).toEqual(["Multilingual", "Technology Student Association member", "High GPA"]);
      expect(generateCriteriaMock).toHaveBeenCalledWith("multilingual technology students");
    });

    it("does nothing when the active goal already has scoreable criteria", async () => {
      const goalWithCriteria: Goal = {
        id: "g1",
        name: "Goal A",
        criteria: [{ id: "c1", label: "Python", importance: "MUST_HAVE" }],
        description: "python engineers",
      };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [goalWithCriteria], "finder.selectedGoalId.v1": "g1" });

      const { initGoalStore, getGoalStoreState, ensureActiveGoalCriteria } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      ensureActiveGoalCriteria();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(generateCriteriaMock).not.toHaveBeenCalled();
    });

    it("falls back to the goal's NAME when it predates the description field entirely — the exact old-user migration case", async () => {
      // A goal saved before `description` existed at all has nothing else recoverable — but its
      // name is itself a real phrase (typed by the user, or produced by an earlier generation
      // pass) describing who it's looking for, e.g. "Multilingual TSA-Related Contacts". Running
      // that same phrase back through the generator is the ONLY way such a goal can ever recover
      // automatically; without this, an old user would be permanently stuck.
      const preMigration: Goal = { id: "g1", name: "Multilingual TSA-Related Contacts", criteria: [] };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [preMigration], "finder.selectedGoalId.v1": "g1" });
      generateCriteriaMock.mockResolvedValue({
        name: "Multilingual TSA-Related Contacts",
        source: "local",
        criteria: [
          { label: "Multilingual", importance: "PREFERRED" },
          { label: "Technology Student Association member", importance: "PREFERRED" },
        ],
      });

      const { initGoalStore, getGoalStoreState, selectActiveGoal, ensureActiveGoalCriteria } = await import("./goalStore");
      const { hasScoreableCriteria } = await import("../../models/goal");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);
      expect(selectActiveGoal(getGoalStoreState())?.description).toBeUndefined();

      ensureActiveGoalCriteria();
      await waitUntil(() => hasScoreableCriteria(selectActiveGoal(getGoalStoreState())!));

      expect(generateCriteriaMock).toHaveBeenCalledWith("Multilingual TSA-Related Contacts");
      const active = selectActiveGoal(getGoalStoreState())!;
      expect(active.id).toBe("g1"); // repaired in place
      expect(active.criteria.map((c) => c.label)).toEqual(["Multilingual", "Technology Student Association member"]);
      // Backfilled so future ticks take the cheaper "has a real description" path.
      expect(active.description).toBe("Multilingual TSA-Related Contacts");
    });

    it("does nothing when the goal has neither a description nor a usable name — nothing left to regenerate from", async () => {
      const broken: Goal = { id: "g1", name: "", criteria: [] };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [broken], "finder.selectedGoalId.v1": "g1" });

      const { initGoalStore, getGoalStoreState, ensureActiveGoalCriteria } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      ensureActiveGoalCriteria();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(generateCriteriaMock).not.toHaveBeenCalled();
    });

    it("leaves the goal criteria-less (honestly) when regeneration genuinely finds nothing", async () => {
      const broken: Goal = { id: "g1", name: "Unparseable", criteria: [], description: "asdf qwer zxcv" };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [broken], "finder.selectedGoalId.v1": "g1" });
      generateCriteriaMock.mockResolvedValue({ name: "Unparseable", source: "local", criteria: [] });

      const { initGoalStore, getGoalStoreState, selectActiveGoal, ensureActiveGoalCriteria } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      ensureActiveGoalCriteria();
      await waitUntil(() => generateCriteriaMock.mock.calls.length > 0);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(selectActiveGoal(getGoalStoreState())?.criteria).toHaveLength(0);
    });

    it("never fires two concurrent regeneration requests for the same goal", async () => {
      const broken: Goal = { id: "g1", name: "Broken", criteria: [], description: "multilingual technology students" };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [broken], "finder.selectedGoalId.v1": "g1" });
      let resolveGenerate: (value: unknown) => void = () => {};
      generateCriteriaMock.mockReturnValue(new Promise((resolve) => (resolveGenerate = resolve)));

      const { initGoalStore, getGoalStoreState, ensureActiveGoalCriteria } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      ensureActiveGoalCriteria();
      ensureActiveGoalCriteria();
      ensureActiveGoalCriteria();

      expect(generateCriteriaMock).toHaveBeenCalledTimes(1);
      resolveGenerate({ name: "Broken", source: "local", criteria: [{ label: "Multilingual", importance: "PREFERRED" }] });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("does not retry a just-failed goal again before the cooldown elapses", async () => {
      const broken: Goal = { id: "g1", name: "Broken", criteria: [], description: "asdf qwer" };
      installFakeChromeStorage({ "finder.goalsSeeded.v1": true, "finder.goals.v1": [broken], "finder.selectedGoalId.v1": "g1" });
      generateCriteriaMock.mockResolvedValue({ name: "Broken", source: "local", criteria: [] });

      const { initGoalStore, getGoalStoreState, ensureActiveGoalCriteria } = await import("./goalStore");
      initGoalStore();
      await waitUntil(() => getGoalStoreState().loaded);

      let clock = 0;
      const now = () => clock;

      ensureActiveGoalCriteria(now);
      await waitUntil(() => generateCriteriaMock.mock.calls.length === 1);

      clock += 5000; // well within the cooldown
      ensureActiveGoalCriteria(now);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(generateCriteriaMock).toHaveBeenCalledTimes(1);

      clock += 30000; // past the cooldown
      ensureActiveGoalCriteria(now);
      await waitUntil(() => generateCriteriaMock.mock.calls.length === 2);
    });
  });
});
