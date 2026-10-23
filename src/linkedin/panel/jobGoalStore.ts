// What the user is looking for in a job, kept apart from the Profile Analyzer's "Looking for": a
// separate stored goal, so editing one never touches the other.
import type { Goal } from "../../models/goal";
import { createStoredPreference } from "./storedPreference";

export const JOB_GOAL_STORAGE_KEY = "finder.jobGoal.v1";

export function decodeJobGoal(stored: unknown): Goal | null | undefined {
  if (stored === null || stored === undefined) return null;
  const goal = stored as Partial<Goal>;
  return typeof goal.id === "string" && Array.isArray(goal.criteria) ? (goal as Goal) : undefined;
}

export const jobGoalPreference = createStoredPreference<Goal | null>(JOB_GOAL_STORAGE_KEY, null, decodeJobGoal);
