// The one goal state the panel reads and writes. Drives both the Goal Setup CRUD and the
// score the analysis sections derive from, so an edit never leaves a stale percentage behind.
//
// Mutations update in-memory state immediately, then persist to chrome.storage.local in the
// background. The onChanged listener picks up changes made from another tab's copy too.
import {
  createCriterion,
  createGoal,
  type Criterion,
  type CriterionCategory,
  type CriterionImportance,
  type CriterionOperator,
  type Goal,
} from "../../models/goal";
import { GOALS_STORAGE_KEYS, loadGoals, loadSelectedGoalId, saveGoals, saveSelectedGoalId } from "../../storage/goalsRepository";

export interface GoalStoreState {
  goals: Goal[];
  selectedGoalId: string | undefined;
  loaded: boolean;
}

type Listener = () => void;

let state: GoalStoreState = { goals: [], selectedGoalId: undefined, loaded: false };
const listeners = new Set<Listener>();

function setState(next: GoalStoreState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getGoalStoreState(): GoalStoreState {
  return state;
}

export function subscribeGoalStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Derives the active Goal from state, a pure function so it can't drift from goals/selectedGoalId.
export function selectActiveGoal(s: GoalStoreState): Goal | null {
  return s.goals.find((g) => g.id === s.selectedGoalId) ?? null;
}

async function refresh(): Promise<void> {
  const [goals, selectedId] = await Promise.all([loadGoals(), loadSelectedGoalId()]);
  setState({ goals, selectedGoalId: selectedId ?? goals[0]?.id, loaded: true });
}

function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== "local") return;
  if (GOALS_STORAGE_KEYS.goals in changes || GOALS_STORAGE_KEYS.selectedGoalId in changes) void refresh();
}

let initialized = false;

// Idempotent, safe to call from every render. Starts the storage listener and first read once.
export function initGoalStore(): void {
  if (initialized) return;
  initialized = true;
  chrome.storage.onChanged.addListener(handleStorageChange);
  void refresh();
}

function persistGoals(next: Goal[]): void {
  setState({ ...state, goals: next });
  void saveGoals(next);
}

export function selectGoal(goalId: string): void {
  setState({ ...state, selectedGoalId: goalId });
  void saveSelectedGoalId(goalId);
}

export function addGoal(name: string): void {
  const goal = createGoal(name);
  persistGoals([...state.goals, goal]);
  selectGoal(goal.id);
}

// Creates a new goal with the given criteria and selects it. Never merges into an existing
// goal, so a generated draft can't silently replace filters set by hand.
export function addGoalFromCriteria(name: string, criteria: { label: string; importance: CriterionImportance }[]): void {
  const goal: Goal = {
    ...createGoal(name || "New goal"),
    criteria: criteria.map((c) => createCriterion(c.label, c.importance)),
  };
  persistGoals([...state.goals, goal]);
  selectGoal(goal.id);
}

export function renameGoal(goalId: string, name: string): void {
  persistGoals(state.goals.map((g) => (g.id === goalId ? { ...g, name } : g)));
}

export function removeGoal(goalId: string): void {
  const next = state.goals.filter((g) => g.id !== goalId);
  persistGoals(next);
  if (state.selectedGoalId === goalId) selectGoal(next[0]?.id ?? "");
}

export function addCriterion(goalId: string, label: string, importance: CriterionImportance): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  persistGoals(
    state.goals.map((g) => (g.id === goalId ? { ...g, criteria: [...g.criteria, createCriterion(trimmed, importance)] } : g)),
  );
}

export function updateCriterion(
  goalId: string,
  criterionId: string,
  updates: Partial<Pick<Criterion, "label" | "importance">>,
): void {
  persistGoals(
    state.goals.map((g) =>
      g.id === goalId ? { ...g, criteria: g.criteria.map((c) => (c.id === criterionId ? { ...c, ...updates } : c)) } : g,
    ),
  );
}

export function removeCriterion(goalId: string, criterionId: string): void {
  persistGoals(state.goals.map((g) => (g.id === goalId ? { ...g, criteria: g.criteria.filter((c) => c.id !== criterionId) } : g)));
}

export interface DraftCriterionInput {
  label: string;
  importance: CriterionImportance;
  category?: CriterionCategory;
  groupId?: string;
  value?: string;
  operator?: CriterionOperator;
  sourceText?: string;
}

// Sets the active goal's criteria, updating the selected goal in place when one exists rather
// than creating a new goal record each time. Only called from an explicit "Create criteria" click.
export function setActiveGoalCriteria(name: string, description: string, criteria: DraftCriterionInput[]): void {
  const builtCriteria = criteria.map((c) =>
    createCriterion(c.label, c.importance, {
      category: c.category,
      groupId: c.groupId,
      value: c.value,
      operator: c.operator,
      sourceText: c.sourceText,
    }),
  );
  const existing = state.goals.find((g) => g.id === state.selectedGoalId);
  if (existing) {
    persistGoals(
      state.goals.map((g) => (g.id === existing.id ? { ...g, name: name || g.name, description, criteria: builtCriteria } : g)),
    );
  } else {
    const goal: Goal = { ...createGoal(name || "My search"), description, criteria: builtCriteria };
    persistGoals([...state.goals, goal]);
    selectGoal(goal.id);
  }
}

// Notes are free-form and never read by matching, just something for the user to jot down.
export function updateGoalNotes(goalId: string, notes: string): void {
  persistGoals(state.goals.map((g) => (g.id === goalId ? { ...g, notes } : g)));
}
