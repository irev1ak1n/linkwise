import { parseKeywords } from "../keywordHighlights";
import { HighlightColorPicker } from "./HighlightColorPicker";
import type { HighlightColor } from "../highlightPalette";

interface SignalModeSectionProps {
  enabled: boolean;
  highlighted: number;
  onChange: (enabled: boolean) => void;
  /** The Focus on keywords, only to know whether their color applies. They are edited up top. */
  keywords: string;
  color: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
  keywordColor: HighlightColor;
  onKeywordColorChange: (color: HighlightColor) => void;
}

// How highlighting looks on the LinkedIn page. What to focus on is set beside Looking for, and
// what the analysis found lives in Key Evidence.
export function SignalModeSection({ enabled, highlighted, onChange, keywords, color, onColorChange, keywordColor, onKeywordColorChange }: SignalModeSectionProps) {
  return (
    <section className="lw-signals lw-hl" aria-label="Profile highlights">
      <h3 className="lw-an-heading">Profile highlights</h3>
      <label className="lw-signals__toggle">
        <span>
          Signal Mode{" "}
          <span className="lw-signals__hint">{enabled && highlighted > 0 ? `${highlighted} passages highlighted on the profile.` : "Highlight useful evidence directly on the profile."}</span>
        </span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {enabled && <HighlightColorPicker label="Signal color" color={color} onChange={onColorChange} />}
      {parseKeywords(keywords).length > 0 && <HighlightColorPicker label="Keyword color" color={keywordColor} onChange={onKeywordColorChange} />}
    </section>
  );
}
