// Local-only persistence for goals/criteria, never synced to a server. Seeds the starter
// goals exactly once, on first-ever run.
import { defaultGoals, type Goal } from "../models/goal";
import { safeStorageGet, safeStorageSet } from "./safeChromeStorage";

const STORAGE_KEY = "finder.goals.v1";
const SEEDED_KEY = "finder.goalsSeeded.v1";
const SELECTED_GOAL_KEY = "finder.selectedGoalId.v1";

// Exported so other contexts can watch these exact keys without duplicating the strings.
export const GOALS_STORAGE_KEYS = { goals: STORAGE_KEY, selectedGoalId: SELECTED_GOAL_KEY };

interface GoalsStorageShape {
  [STORAGE_KEY]?: Goal[];
  [SEEDED_KEY]?: boolean;
}

export async function loadGoals(): Promise<Goal[]> {
  const stored = (await safeStorageGet([STORAGE_KEY, SEEDED_KEY])) as GoalsStorageShape;
  if (stored[SEEDED_KEY]) {
    return stored[STORAGE_KEY] ?? [];
  }

  const seeded = defaultGoals();
  await safeStorageSet({ [STORAGE_KEY]: seeded, [SEEDED_KEY]: true });
  return seeded;
}

export async function saveGoals(goals: Goal[]): Promise<void> {
  await safeStorageSet({ [STORAGE_KEY]: goals });
}

export async function loadSelectedGoalId(): Promise<string | undefined> {
  const stored = await safeStorageGet(SELECTED_GOAL_KEY);
  return stored[SELECTED_GOAL_KEY] as string | undefined;
}

export async function saveSelectedGoalId(goalId: string): Promise<void> {
  await safeStorageSet({ [SELECTED_GOAL_KEY]: goalId });
}
