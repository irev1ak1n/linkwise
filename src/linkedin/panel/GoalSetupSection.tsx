import { useState } from "react";
import type { Goal } from "../../models/goal";
import { GOAL_TEXT_MAX_LENGTH } from "../../nlp/goalTextParser";
import { generateCriteria } from "../../ai/generateCriteria";
import type { DraftCriterionInput } from "./goalStore";

interface GoalSetupSectionProps {
  goal: Goal | null;
  onSetActiveCriteria: (name: string, criteria: DraftCriterionInput[]) => void;
}

// The Goal Setup half of the panel. Describe who you're looking for, LinkWise turns it
// straight into criteria. No separate review step, "Create criteria" is the only action.
export function GoalSetupSection({ goal, onSetActiveCriteria }: GoalSetupSectionProps) {
  const [text, setText] = useState("");
  // True while a "Create criteria" request is out, cleared in the finally block below either way.
  const [generating, setGenerating] = useState(false);
  // Short-lived feedback below the button, cleared as soon as the description changes again.
  const [message, setMessage] = useState<string | null>(null);

  async function handleCreateCriteria(): Promise<void> {
    setGenerating(true);
    setMessage(null);
    try {
      const result = await generateCriteria(text);
      if (result.criteria.length === 0) {
        setMessage("We couldn't find enough detail in that description — try adding a role, location, or experience.");
        return;
      }
      onSetActiveCriteria(
        result.name || text.trim() || "My search",
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
      setMessage(goal ? "Updated your active goal." : "Goal created — analyzing any open profile now.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="app__section lw-goal">
      <h2>Who are you looking for?</h2>
      <textarea
        className="text-area"
        value={text}
        maxLength={GOAL_TEXT_MAX_LENGTH}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(null);
        }}
        rows={3}
      />
      <div className="lw-goal__footer">
        <span className="char-count">
          {text.length} / {GOAL_TEXT_MAX_LENGTH}
        </span>
        <button type="button" className="button button--primary" disabled={!text.trim() || generating} onClick={() => void handleCreateCriteria()}>
          {generating ? "Creating criteria…" : "Create criteria"}
        </button>
      </div>
      {message && <p className="lw-goal__message">{message}</p>}
      {goal && <p className="lw-goal__active">Active goal: {goal.name}</p>}
    </section>
  );
}
