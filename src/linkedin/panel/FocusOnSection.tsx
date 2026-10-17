import { useState } from "react";
import { parseKeywords } from "../keywordHighlights";

// The highlighter matches case-insensitively and ignores repeats and order, so only a change to
// that set is a real edit.
export function keywordSetKey(text: string): string {
  return [...new Set(parseKeywords(text).map((keyword) => keyword.toLowerCase()))].sort().join("\n");
}

interface FocusOnSectionProps {
  keywords: string;
  onSave: (keywords: string) => void;
}

// Words to surface on every profile, beside what the person is looking for. Purely local
// highlighting: never part of the goal, the match, or any AI request.
export function FocusOnSection({ keywords, onSave }: FocusOnSectionProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = parseKeywords(keywords);

  if (draft === null) {
    return (
      <section className="lw-an-goal lw-focus" aria-label="Focus on">
        <div className="lw-an-goal__text">
          <span className="lw-an-goal__label">Focus on</span>
          {shown.length > 0 ? <p title={shown.join(", ")}>{shown.join(", ")}</p> : <p className="lw-focus__empty">Add specific words or phrases</p>}
        </div>
        <button type="button" className="lw-an-more" onClick={() => setDraft(keywords)}>
          Edit
        </button>
      </section>
    );
  }

  const unchanged = keywordSetKey(draft) === keywordSetKey(keywords);
  return (
    <section className="lw-an-goal lw-focus is-editing" aria-label="Focus on">
      <label className="lw-an-goal__text">
        <span className="lw-an-goal__label">Focus on</span>
        <textarea className="lw-keywords__input" rows={2} value={draft} spellCheck={false} placeholder="Python, robotics, volunteer" onChange={(e) => setDraft(e.target.value)} />
        <span className="lw-scan-mode__hint">Comma or newline separated.</span>
      </label>
      <div className="lw-goal__actions">
        <button type="button" className="button" onClick={() => setDraft(null)}>
          Cancel
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={unchanged}
          title={unchanged ? "Change the keywords to save" : undefined}
          onClick={() => {
            onSave(draft.trim());
            setDraft(null);
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}
