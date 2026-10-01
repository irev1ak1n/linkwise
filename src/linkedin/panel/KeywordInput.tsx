import { useEffect, useRef, useState } from "react";
import { HighlightColorPicker } from "./HighlightColorPicker";
import type { HighlightColor } from "../highlightPalette";

export const KEYWORD_INPUT_DEBOUNCE_MS = 300;

interface KeywordInputProps {
  value: string;
  onChange: (value: string) => void;
  color: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
}

export function KeywordInput({ value, onChange, color, onColorChange }: KeywordInputProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return;
    const handle = setTimeout(() => {
      committed.current = draft;
      onChange(draft);
    }, KEYWORD_INPUT_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [draft, onChange]);

  return (
    <div className="lw-keywords">
      <label className="lw-keywords">
        <span className="lw-keywords__label">Highlight keywords</span>
        <textarea
          className="lw-keywords__input"
          rows={2}
          value={draft}
          spellCheck={false}
          placeholder="Python, robotics, volunteer"
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      {draft.trim() !== "" && <HighlightColorPicker label="Keyword color" color={color} onChange={onColorChange} />}
    </div>
  );
}
