import { describe, expect, it } from "vitest";
import { GOALS_STORAGE_KEYS } from "../../storage/goalsRepository";
import { JOB_GOAL_STORAGE_KEY, decodeJobGoal } from "./jobGoalStore";

describe("job goal storage", () => {
  it("is its own stored value, never the Profile Analyzer's goals", () => {
    expect(JOB_GOAL_STORAGE_KEY).not.toBe(GOALS_STORAGE_KEYS.goals);
    expect(JOB_GOAL_STORAGE_KEY).not.toBe(GOALS_STORAGE_KEYS.selectedGoalId);
  });

  it("reads a saved goal, treats nothing as no goal, and ignores junk", () => {
    const goal = { id: "g", name: "Internships", criteria: [{ id: "c", label: "Remote", importance: "PREFERRED" }] };
    expect(decodeJobGoal(goal)).toEqual(goal);
    expect(decodeJobGoal(undefined)).toBeNull();
    expect(decodeJobGoal("nonsense")).toBeUndefined();
  });
});
