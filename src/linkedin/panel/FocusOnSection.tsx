import { useState } from "react";
import { parseKeywords } from "../keywordHighlights";

export const HIGHLIGHT_TEXT_MAX_LENGTH = 500;

// The highlighter matches case-insensitively and ignores repeats and order, so only a change to
// that set is a real edit.
export function keywordSetKey(text: string): string {
  return [...new Set(parseKeywords(text).map((keyword) => keyword.toLowerCase()))].sort().join("\n");
}

interface FocusOnSectionProps {
  keywords: string;
  onSave: (keywords: string) => void;
}

// Terms to highlight on every profile, beside what the person is looking for. Purely local
// highlighting: never part of the goal, the match, or any AI request.
export function FocusOnSection({ keywords, onSave }: FocusOnSectionProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = parseKeywords(keywords);

  if (draft === null) {
    return (
      <section className="lw-an-goal lw-focus" aria-label="Highlight on profile">
        <div className="lw-an-goal__text">
          <span className="lw-an-goal__label">Highlight on profile</span>
          {shown.length > 0 ? <p title={shown.join(", ")}>{shown.join(", ")}</p> : <p className="lw-focus__empty">Add specific words or phrases</p>}
        </div>
        <button type="button" className="lw-an-more" onClick={() => setDraft(keywords)}>
          Edit
        </button>
      </section>
    );
  }

  const unchanged = keywordSetKey(draft) === keywordSetKey(keywords);
  // The same form as Looking for: heading, textarea, then the counter and actions beneath it.
  return (
    <section className="app__section lw-goal lw-focus-edit" aria-label="Highlight on profile">
      <h2>Highlight on profile</h2>
      <textarea
        className="text-area"
        rows={2}
        maxLength={HIGHLIGHT_TEXT_MAX_LENGTH}
        value={draft}
        spellCheck={false}
        placeholder="Python, robotics, volunteer"
        onChange={(e) => setDraft(e.target.value.slice(0, HIGHLIGHT_TEXT_MAX_LENGTH))}
      />
      <div className="lw-goal__footer">
        <span className="char-count">
          {draft.length} / {HIGHLIGHT_TEXT_MAX_LENGTH}
        </span>
        <div className="lw-goal__actions">
          <button type="button" className="button" onClick={() => setDraft(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={unchanged}
            title={unchanged ? "Change the terms to save" : undefined}
            onClick={() => {
              onSave(draft.trim());
              setDraft(null);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
