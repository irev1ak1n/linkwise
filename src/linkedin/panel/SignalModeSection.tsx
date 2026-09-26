import type { SignalAnalysisState } from "../../ai/signalAnalysisController";
import { describeAiUnavailableReason } from "../../ai/aiUnavailableReason";

interface SignalModeSectionProps {
  enabled: boolean;
  analysis: SignalAnalysisState;
  highlighted: number;
  onChange: (enabled: boolean) => void;
}

function SignalStatus({ analysis, highlighted }: Pick<SignalModeSectionProps, "analysis" | "highlighted">) {
  if (analysis.status === "idle") return <p className="lw-signals__status">Waiting for the profile to finish loading…</p>;
  if (analysis.status === "loading") return <p className="lw-signals__status">Finding high-signal evidence…</p>;
  if (analysis.status === "unavailable") {
    return <p className="lw-signals__status lw-signals__status--error">AI signal analysis unavailable: {describeAiUnavailableReason(analysis.reason)}.</p>;
  }
  if (analysis.facts.length === 0) return <p className="lw-signals__status">No strong evidence found on this profile.</p>;

  return (
    <details className="lw-signals__facts" open>
      <summary>
        High-signal facts <span className="lw-signals__count">{highlighted} highlighted</span>
      </summary>
      <ul>
        {analysis.facts.map((fact) => (
          <li key={`${fact.evidenceId}:${fact.text}`}>{fact.text}</li>
        ))}
      </ul>
    </details>
  );
}

export function SignalModeSection({ enabled, analysis, highlighted, onChange }: SignalModeSectionProps) {
  return (
    <div className="lw-signals">
      <label className="lw-signals__toggle">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
        <span>
          Signal Mode <span className="lw-signals__hint">Highlight useful evidence</span>
        </span>
      </label>
      {enabled && <SignalStatus analysis={analysis} highlighted={highlighted} />}
    </div>
  );
}
