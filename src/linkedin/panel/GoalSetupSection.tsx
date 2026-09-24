import { useEffect, useState, useSyncExternalStore } from "react";
import type { Goal } from "../../models/goal";
import { GOAL_TEXT_MAX_LENGTH } from "../../nlp/goalTextParser";
import { generateCriteria } from "../../ai/generateCriteria";
import { isPanelVisible, subscribePanelVisibility } from "./panelVisibilityStore";
import type { DraftCriterionInput } from "./goalStore";

interface GoalSetupSectionProps {
  goal: Goal | null;
  profileKey: string | null;
  onSetActiveCriteria: (name: string, description: string, criteria: DraftCriterionInput[]) => void;
}

// The textarea reflects the committed active goal, not a search box. With no active goal it's
// editable so the user can create one. With an active goal it's read-only until Edit is
// clicked, and an in-progress edit is only a local draft until Save succeeds.
export function GoalSetupSection({ goal, profileKey, onSetActiveCriteria }: GoalSetupSectionProps) {
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

  async function handleSubmit(): Promise<void> {
    setGenerating(true);
    setMessage(null);
    try {
      const description = draft.trim();
      const result = await generateCriteria(draft);
      if (result.criteria.length === 0) {
        setMessage("We couldn't find enough detail in that description — try adding a role, location, or experience.");
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
      setMessage(hasActiveGoal ? "Updated your active goal." : "Goal created — analyzing any open profile now.");
    } finally {
      setGenerating(false);
    }
  }

  const editable = !hasActiveGoal || isEditing;
  const textareaValue = editable ? draft : (goal?.description ?? "");

  return (
    <section className="app__section lw-goal">
      <h2>Who are you looking for?</h2>
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
      />
      <div className="lw-goal__footer">
        <span className="char-count">{editable ? `${draft.length} / ${GOAL_TEXT_MAX_LENGTH}` : ""}</span>
        <div className="lw-goal__actions">
          {editable ? (
            <>
              <button
                type="button"
                className="button button--primary"
                disabled={!draft.trim() || generating}
                onClick={() => void handleSubmit()}
              >
                {generating ? (hasActiveGoal ? "Saving…" : "Creating criteria…") : hasActiveGoal ? "Save" : "Create criteria"}
              </button>
              {hasActiveGoal && (
                <button type="button" className="button" disabled={generating} onClick={handleCancel}>
                  Cancel
                </button>
              )}
            </>
          ) : (
            <button type="button" className="button" onClick={handleEdit}>
              Edit
            </button>
          )}
        </div>
      </div>
      {message && <p className="lw-goal__message">{message}</p>}
    </section>
  );
}
