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

// The one hook both Goal Setup and the analysis sections use. Backed by useSyncExternalStore
// rather than local state, so there's no stale-closure surface to get wrong.
//
// addGoal/renameGoal/removeGoal/selectGoal stay here even though the current panel UI doesn't
// expose goal-switching chrome, the underlying multi-goal storage still works.
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
