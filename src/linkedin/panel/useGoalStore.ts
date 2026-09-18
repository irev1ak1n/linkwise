import { useSyncExternalStore } from "react";
import {
  addCriterion,
  addGoal,
  addGoalFromCriteria,
  getGoalStoreState,
  initGoalStore,
  removeCriterion,
  removeGoal,
  renameGoal,
  selectActiveGoal,
  selectGoal,
  setActiveGoalCriteria,
  subscribeGoalStore,
  updateCriterion,
  updateGoalNotes,
} from "./goalStore";

/**
 * The single hook both the Goal Setup section and the profile-scanning/analysis sections use —
 * there is no separate hook for a browser-side-panel editor anymore. Backed by
 * `useSyncExternalStore` rather than a local useState/useEffect hook, specifically so the update
 * path has no dependency array or stale-closure surface to get wrong (a real bug this project
 * hit earlier when the goal-selection state lived in component-local state instead).
 *
 * `addGoal`/`addGoalFromCriteria`/`renameGoal`/`removeGoal`/`selectGoal` are kept here even
 * though the simplified in-page panel UI no longer exposes goal-switching chrome to call them —
 * the underlying multi-goal storage/model still works, and nothing about it was deleted, per
 * the mission's own "do not delete underlying storage/model functionality" instruction.
 */
export function useGoalStore() {
  initGoalStore();
  const state = useSyncExternalStore(subscribeGoalStore, getGoalStoreState);
  return {
    goals: state.goals,
    selectedGoal: selectActiveGoal(state),
    loaded: state.loaded,
    selectGoal,
    addGoal,
    addGoalFromCriteria,
    renameGoal,
    removeGoal,
    addCriterion,
    updateCriterion,
    removeCriterion,
    setActiveGoalCriteria,
    updateGoalNotes,
  };
}
