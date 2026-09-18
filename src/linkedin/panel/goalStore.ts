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
  hasScoreableCriteria,
  type Criterion,
  type CriterionCategory,
  type CriterionImportance,
  type CriterionOperator,
  type Goal,
} from "../../models/goal";
import { GOALS_STORAGE_KEYS, loadGoals, loadSelectedGoalId, saveGoals, saveSelectedGoalId } from "../../storage/goalsRepository";
import { generateCriteria } from "../../ai/generateCriteria";

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

function buildCriteria(criteria: DraftCriterionInput[]): Criterion[] {
  return criteria.map((c) =>
    createCriterion(c.label, c.importance, {
      category: c.category,
      groupId: c.groupId,
      value: c.value,
      operator: c.operator,
      sourceText: c.sourceText,
    }),
  );
}

/** Commits a freshly-generated batch of criteria as the ACTIVE goal's criteria — updating the
 * currently-selected goal in place when one exists, rather than creating a new goal record every
 * time a description is regenerated (the old "always a new goal" behavior made sense when goals
 * were user-managed and switchable; the simplified panel has effectively one working search
 * intent at a time). `description` is the raw text that produced these criteria — persisted
 * alongside them (see `Goal.description`'s own doc comment) so `ensureActiveGoalCriteria` below
 * can regenerate from it later if these criteria are ever somehow lost. Passing `undefined`
 * leaves whatever description the goal already had untouched (used by the auto-repair path
 * itself, which is re-deriving criteria from a description that's already stored, not setting a
 * new one). */
export function setActiveGoalCriteria(name: string, criteria: DraftCriterionInput[], description?: string): void {
  const builtCriteria = buildCriteria(criteria);
  const existing = state.goals.find((g) => g.id === state.selectedGoalId);
  if (existing) {
    persistGoals(
      state.goals.map((g) =>
        g.id === existing.id
          ? { ...g, name: name || g.name, criteria: builtCriteria, description: description ?? g.description }
          : g,
      ),
    );
  } else {
    const goal: Goal = { ...createGoal(name || "My search"), criteria: builtCriteria, description };
    persistGoals([...state.goals, goal]);
    selectGoal(goal.id);
  }
}

const repairInFlight = new Set<string>();
const lastRepairAttemptAt = new Map<string, number>();
/** However often `ensureActiveGoalCriteria` gets called (every content.ts tick — every few
 * seconds while a goal is active), never retry a description that just failed more than once per
 * this cooldown. Deliberately short rather than a more conservative rate limit: confirmed live,
 * the backend's AI criteria generation is non-deterministic — the exact same description can
 * return real criteria on one call and an empty list on the next (a direct curl and the
 * extension's own fetch, moments apart, produced different results for the identical input) —
 * so a short retry window meaningfully increases the odds of landing a good result inside the
 * product's own "~10 seconds to a Match %" target, rather than leaving a goal stuck on a single
 * unlucky attempt for half a minute. Still long enough that a genuinely-down backend or an
 * unparseable description doesn't turn into a request on every single tick. */
const REPAIR_RETRY_COOLDOWN_MS = 6000;

/**
 * Self-heals an active goal that ended up with zero scoreable (non-EXCLUDED) criteria — an
 * older goal from before criteria were reliably persisted, a "Create criteria" attempt whose AI
 * call failed with no local-parser match either, or any other way the goal → criteria link could
 * have desynced. Re-runs the exact same AI-first/local-fallback generator `GoalSetupSection`
 * itself uses (see `ai/generateCriteria.ts`), then persists the result onto this SAME active
 * goal — never creating a new one — so the very next scoring pass (see linkedin/content.ts's
 * `tick()`) picks it up with no action from the user.
 *
 * What it regenerates FROM: the goal's stored `description` when there is one, falling back to
 * its `name` otherwise. This matters for goals that predate the `description` field entirely —
 * one created before this repair mechanism existed has no description to recover, but its NAME
 * is itself a real, human-authored (or AI/local-generated) phrase describing who it's looking
 * for (e.g. "Multilingual TSA-Related Contacts"), so running that same phrase back through the
 * generator recovers real criteria without ever needing the user to retype anything. Confirmed
 * live: this is the only way an old, pre-migration saved goal can ever recover automatically,
 * since nothing else about it was ever persisted. A goal with neither field usable (should not
 * happen in practice — every goal has a name) has nothing left to regenerate from.
 *
 * Safe to call unconditionally on every tick: it no-ops instantly unless a genuine repair is
 * actually needed, never runs two repairs for the same goal concurrently, and never retries a
 * goal that just failed within `REPAIR_RETRY_COOLDOWN_MS`. `now` is injectable purely for tests.
 */
export function ensureActiveGoalCriteria(now: () => number = Date.now): void {
  const goal = selectActiveGoal(state);
  if (!goal || hasScoreableCriteria(goal)) return;
  const source = goal.description?.trim() || goal.name?.trim();
  if (!source) return;
  if (repairInFlight.has(goal.id)) return;
  const lastAttempt = lastRepairAttemptAt.get(goal.id);
  if (lastAttempt !== undefined && now() - lastAttempt < REPAIR_RETRY_COOLDOWN_MS) return;

  repairInFlight.add(goal.id);
  lastRepairAttemptAt.set(goal.id, now());
  void generateCriteria(source)
    .then((result) => {
      if (result.criteria.length === 0) return; // genuinely nothing generatable — leave as is
      // The user may have switched to (or replaced) the active goal while this request was in
      // flight — never apply a stale regeneration to whatever is active now.
      if (selectActiveGoal(state)?.id !== goal.id) return;
      persistGoals(
        state.goals.map((g) =>
          g.id === goal.id
            ? { ...g, name: result.name || g.name, criteria: buildCriteria(result.criteria), description: g.description ?? source }
            : g,
        ),
      );
    })
    .finally(() => repairInFlight.delete(goal.id));
}

/** Persists just the description onto the currently-active goal, touching nothing else —
 * specifically for `GoalSetupSection`'s "Create criteria" failure path: when generation finds
 * nothing usable, the criteria must NOT be overwritten (a failed regeneration attempt must never
 * wipe an already-working goal's criteria), but the description is worth keeping if a goal is
 * already active, so `ensureActiveGoalCriteria` can retry automatically later without the user
 * retyping anything. A no-op when no goal is active yet — there is nothing to attach a
 * description to, and inventing a brand-new goal from a description that just failed to produce
 * any criteria at all would only create another criteria-less goal, not fix anything. */
export function rememberGoalDescription(description: string): void {
  const trimmed = description.trim();
  if (!trimmed) return;
  const existing = selectActiveGoal(state);
  if (!existing || existing.description === trimmed) return;
  persistGoals(state.goals.map((g) => (g.id === existing.id ? { ...g, description: trimmed } : g)));
}

/** Notes are free-form and never read by matching/scoring — persisted alongside the goal purely
 * so the user has somewhere to jot context that survives closing and reopening the panel. */
export function updateGoalNotes(goalId: string, notes: string): void {
  persistGoals(state.goals.map((g) => (g.id === goalId ? { ...g, notes } : g)));
}
