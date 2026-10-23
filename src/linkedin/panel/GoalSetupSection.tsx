import { useEffect, useState, useSyncExternalStore } from "react";
import type { Goal } from "../../models/goal";
import { GOAL_TEXT_MAX_LENGTH } from "../../nlp/goalTextParser";
import { generateCriteria } from "../../ai/generateCriteria";
import { isPanelVisible, subscribePanelVisibility } from "./panelVisibilityStore";
import type { DraftCriterionInput } from "./goalStore";

// Only a real wording change counts: spacing, line breaks and case alone never regenerate criteria.
export function normalizeGoalText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isGoalDraftUnchanged(draft: string, goal: Goal | null): boolean {
  return !!goal?.description && normalizeGoalText(draft) === normalizeGoalText(goal.description);
}

interface GoalSetupSectionProps {
  goal: Goal | null;
  profileKey: string | null;
  onSetActiveCriteria: (name: string, description: string, criteria: DraftCriterionInput[]) => void;
  /** What the criteria describe; the Job Analyzer keeps its own, about jobs. */
  kind?: "person" | "job";
  /** Wording that differs between the people and the jobs versions. */
  copy?: { label: string; heading: string; placeholder?: string; vague: string; created: string };
}

const PERSON_COPY = {
  label: "Looking for",
  heading: "Who are you looking for?",
  vague: "We couldn't find enough detail in that description — try adding a role, location, or experience.",
  created: "Goal created — analyzing any open profile now.",
};

// The textarea reflects the committed active goal, not a search box. With no active goal it's
// editable so the user can create one. With an active goal it's read-only until Edit is
// clicked, and an in-progress edit is only a local draft until Save succeeds.
export function GoalSetupSection({ goal, profileKey, onSetActiveCriteria, kind = "person", copy = PERSON_COPY }: GoalSetupSectionProps) {
  const hasActiveGoal = !!goal?.description;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const panelVisible = useSyncExternalStore(subscribePanelVisibility, isPanelVisible);

  // Discard an unsaved edit whenever the user could plausibly have walked away from it:
  // closing/reopening the panel, or switching to a different profile.
  useEffect(() => {
    if (hasActiveGoal) {
      setIsEditing(false);
      setMessage(null);
    }
  }, [panelVisible, profileKey]);

  function handleEdit(): void {
    setDraft(goal?.description ?? "");
    setIsEditing(true);
    setMessage(null);
  }

  function handleCancel(): void {
    setIsEditing(false);
    setMessage(null);
  }

  const unchanged = isGoalDraftUnchanged(draft, goal);

  async function handleSubmit(): Promise<void> {
    if (unchanged) return;
    setGenerating(true);
    setMessage(null);
    try {
      const description = draft.trim();
      const result = await generateCriteria(draft, { kind });
      if (result.criteria.length === 0) {
        setMessage(copy.vague);
        return;
      }
      onSetActiveCriteria(
        result.name || "My search",
        description,
        result.criteria.map((c) => ({
          label: c.label,
          importance: c.importance,
          category: c.category,
          groupId: c.groupId,
          value: c.value,
          operator: c.operator,
          sourceText: c.sourceText,
        })),
      );
      setIsEditing(false);
      setMessage(hasActiveGoal ? "Updated your active goal." : copy.created);
    } finally {
      setGenerating(false);
    }
  }

  const editable = !hasActiveGoal || isEditing;
  const textareaValue = editable ? draft : (goal?.description ?? "");

  if (!editable) {
    return (
      <section className="lw-an-goal">
        <div className="lw-an-goal__text">
          <span className="lw-an-goal__label">{copy.label}</span>
          <p title={goal?.description}>{goal?.description}</p>
        </div>
        <button type="button" className="lw-an-more" onClick={handleEdit}>
          Edit
        </button>
        {message && <p className="lw-goal__message">{message}</p>}
      </section>
    );
  }

  return (
    <section className="app__section lw-goal">
      <h2>{copy.heading}</h2>
      <textarea
        className="text-area"
        value={textareaValue}
        maxLength={GOAL_TEXT_MAX_LENGTH}
        readOnly={!editable}
        onChange={
          editable
            ? (e) => {
                setDraft(e.target.value);
                setMessage(null);
              }
            : undefined
        }
        rows={3}
        placeholder={copy.placeholder}
      />
      <div className="lw-goal__footer">
        <span className="char-count">{editable ? `${draft.length} / ${GOAL_TEXT_MAX_LENGTH}` : ""}</span>
        <div className="lw-goal__actions">
          {editable ? (
            <>
              {hasActiveGoal && (
                <button type="button" className="button" disabled={generating} onClick={handleCancel}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="button button--primary"
                disabled={!draft.trim() || generating || unchanged}
                title={unchanged ? "Change the description to save" : undefined}
                onClick={() => void handleSubmit()}
              >
                {generating ? (hasActiveGoal ? "Saving…" : "Creating criteria…") : hasActiveGoal ? "Save" : "Create criteria"}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {message && <p className="lw-goal__message">{message}</p>}
    </section>
  );
}
