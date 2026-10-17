import { KeywordInput } from "./KeywordInput";
import { parseKeywords } from "../keywordHighlights";
import { HighlightColorPicker } from "./HighlightColorPicker";
import type { HighlightColor } from "../highlightPalette";

interface SignalModeSectionProps {
  enabled: boolean;
  highlighted: number;
  onChange: (enabled: boolean) => void;
  keywords: string;
  onKeywordsChange: (keywords: string) => void;
  color: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
  keywordColor: HighlightColor;
  onKeywordColorChange: (color: HighlightColor) => void;
}

// Controls for highlighting the LinkedIn page; what the analysis found lives in Key Evidence.
export function SignalModeSection({ enabled, highlighted, onChange, keywords, onKeywordsChange, color, onColorChange, keywordColor, onKeywordColorChange }: SignalModeSectionProps) {
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
      {enabled && <HighlightColorPicker color={color} onChange={onColorChange} />}
      <details className="lw-hl__more">
        <summary>
          <span>Highlight keywords</span>
          {parseKeywords(keywords).length > 0 && <span className="lw-signals__count">{parseKeywords(keywords).length}</span>}
        </summary>
        <KeywordInput value={keywords} onChange={onKeywordsChange} color={keywordColor} onColorChange={onKeywordColorChange} />
      </details>
    </section>
  );
}
