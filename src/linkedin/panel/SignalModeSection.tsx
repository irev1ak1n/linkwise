import type { SignalAnalysisState } from "../../ai/signalAnalysisController";
import { describeAiUnavailableReason } from "../../ai/aiUnavailableReason";
import { sectionLabel } from "./sectionLabels";
import { KeywordInput } from "./KeywordInput";
import { parseKeywords } from "../keywordHighlights";
import { HighlightColorPicker } from "./HighlightColorPicker";
import type { HighlightColor } from "../highlightPalette";

interface SignalModeSectionProps {
  enabled: boolean;
  analysis: SignalAnalysisState;
  highlighted: number;
  onChange: (enabled: boolean) => void;
  keywords: string;
  onKeywordsChange: (keywords: string) => void;
  color: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
  keywordColor: HighlightColor;
  onKeywordColorChange: (color: HighlightColor) => void;
  updatingSection?: string | null;
}

function SignalStatus({ analysis, highlighted, updatingSection }: Pick<SignalModeSectionProps, "analysis" | "highlighted" | "updatingSection">) {
  if (analysis.status === "idle") return <p className="lw-signals__status">Waiting for the profile to finish loading…</p>;
  if (analysis.status === "loading") return <p className="lw-signals__status">Finding high-signal evidence…</p>;
  if (analysis.status === "unavailable") {
    return <p className="lw-signals__status lw-signals__status--error">AI signal analysis unavailable: {describeAiUnavailableReason(analysis.reason)}.</p>;
  }
  const label = sectionLabel(updatingSection);
  const note = analysis.updating ? (
    <p className="lw-signals__status">Updating signals{label ? ` with ${label}` : ""}…</p>
  ) : analysis.updateError ? (
    <p className="lw-signals__status lw-signals__status--error">Couldn't update signals — showing the previous ones.</p>
  ) : null;
  if (analysis.facts.length === 0) return note ?? <p className="lw-signals__status">No strong evidence found on this profile.</p>;

  return (
    <>
      {note}
      <details className="lw-hl__more lw-signals__facts">
        <summary>
          <span>High-signal facts</span>
          <span className="lw-signals__count" title={`${highlighted} highlighted on the profile`}>
            {analysis.facts.length}
          </span>
        </summary>
        <ul>
          {analysis.facts.map((fact) => (
            <li key={`${fact.evidenceId}:${fact.text}`}>{fact.text}</li>
          ))}
        </ul>
      </details>
    </>
  );
}

// Profile Analyzer's highlighting controls: one row each, details only when opened.
export function SignalModeSection({ enabled, analysis, highlighted, onChange, keywords, onKeywordsChange, color, onColorChange, keywordColor, onKeywordColorChange, updatingSection }: SignalModeSectionProps) {
  return (
    <section className="lw-signals lw-hl" aria-label="Profile highlights">
      <h3 className="lw-an-heading">Profile highlights</h3>
      <label className="lw-signals__toggle">
        <span>
          Signal Mode <span className="lw-signals__hint">Highlight useful evidence directly on the profile.</span>
        </span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      </label>
      {enabled && <HighlightColorPicker color={color} onChange={onColorChange} />}
      {enabled && <SignalStatus analysis={analysis} highlighted={highlighted} updatingSection={updatingSection} />}
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
