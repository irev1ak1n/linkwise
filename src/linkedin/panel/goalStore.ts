// The ONE goal state the in-page LinkWise panel reads and writes — there is no separate
// browser-side-panel goal editor anymore, so this store has to do double duty: it drives the
// Goal Setup section's CRUD (add/rename/remove a goal, add/update/remove a criterion) AND is
// the same state the profile-scanning/analysis sections derive their score from. Keeping it as
// one external store (rather than a plain useState/useEffect hook local to the editor
// component) is what makes "changing the goal recalculates instantly from already-collected
// evidence" fall out for free: PanelApp derives the score fresh on every render from
// `scoreProfileAgainstGoal(goal, profile)` — nothing here ever caches a score, only the goal
// itself, so an edit can never leave a stale percentage behind, and the editor and the scorer
// can never drift out of sync since they're reading the exact same module-level state.
//
// Mutations update this in-memory state immediately (so the editor UI feels instant) and persist
// to chrome.storage.local in the background; the chrome.storage.onChanged listener below exists
// so a change made from a different tab's copy of this same panel is still picked up here too.
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

/** Derives the currently-active Goal object from state — kept as a pure function rather than
 * duplicated state so it can never drift from `goals`/`selectedGoalId`. */
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

/** Idempotent — safe to call from every render of every consumer. Starts the storage listener
 * and the first read exactly once, at whichever moment the panel first needs goal data. */
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

/** Creates a brand-new goal pre-populated with the given criteria (typically from a
 * reviewed/edited NLP or document draft) and selects it. Always a NEW goal — never merges into
 * or overwrites an existing one, so a generated draft can never silently replace filters the
 * user configured by hand. */
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

/** Commits a reviewed batch of criteria (from the "Your ideal match" card's Create-criteria
 * flow) as the ACTIVE goal's criteria — updating the currently-selected goal in place when one
 * exists, rather than creating a new goal record every time a description is regenerated (the
 * old "always a new goal" behavior made sense when goals were user-managed and switchable; the
 * simplified panel has effectively one working search intent at a time). Only ever called from
 * an explicit "Use these criteria" click — never automatically just because the description
 * text changed, so a manually-edited active criterion is never silently replaced by a stale or
 * unreviewed draft. */
export function setActiveGoalCriteria(name: string, criteria: DraftCriterionInput[]): void {
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
    persistGoals(state.goals.map((g) => (g.id === existing.id ? { ...g, name: name || g.name, criteria: builtCriteria } : g)));
  } else {
    const goal: Goal = { ...createGoal(name || "My search"), criteria: builtCriteria };
    persistGoals([...state.goals, goal]);
    selectGoal(goal.id);
  }
}

/** Notes are free-form and never read by matching/scoring — persisted alongside the goal purely
 * so the user has somewhere to jot context that survives closing and reopening the panel. */
export function updateGoalNotes(goalId: string, notes: string): void {
  persistGoals(state.goals.map((g) => (g.id === goalId ? { ...g, notes } : g)));
}
