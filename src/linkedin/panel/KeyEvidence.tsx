import { useState } from "react";
import type { SignalAnalysisState } from "../../ai/signalAnalysisController";
import { describeAiUnavailableReason } from "../../ai/aiUnavailableReason";
import { sectionLabel } from "./sectionLabels";

export const KEY_EVIDENCE_SHOWN = 5;

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\d]+/gu, " ").trim();

interface KeyEvidenceProps {
  analysis: SignalAnalysisState;
  updatingSection?: string | null;
  /** Sentences already shown under Why they match, never repeated here. */
  exclude?: string[];
}

// The strongest concrete facts about the person, from the same grounded analysis Signal Mode
// highlights with, already ranked by the backend.
export function KeyEvidence({ analysis, updatingSection, exclude = [] }: KeyEvidenceProps) {
  const [expanded, setExpanded] = useState(false);
  let body;
  if (analysis.status === "idle" || analysis.status === "loading") {
    body = <p className="lw-dash__none">Finding key evidence…</p>;
  } else if (analysis.status === "unavailable") {
    body = <p className="lw-dash__none">Key evidence is unavailable right now: {describeAiUnavailableReason(analysis.reason)}.</p>;
  } else {
    const shown = new Set(exclude.map(normalize));
    const facts = analysis.facts.filter((fact) => !shown.has(normalize(fact.text)));
    if (facts.length === 0) return null;
    const visible = expanded ? facts : facts.slice(0, KEY_EVIDENCE_SHOWN);
    const hidden = facts.length - visible.length;
    const label = sectionLabel(updatingSection);
    body = (
      <>
        {analysis.updating && <p className="lw-dash__none">Updating{label ? ` with ${label}` : ""}…</p>}
        <ul className="lw-key-evidence">
          {visible.map((fact) => (
            <li key={`${fact.evidenceId}:${fact.text}`}>{fact.text}</li>
          ))}
        </ul>
        {hidden > 0 && (
          <button type="button" className="lw-scan__link" onClick={() => setExpanded(true)}>
            Show {hidden} more
          </button>
        )}
      </>
    );
  }
  return (
    <section className="lw-dash__block" aria-label="Key evidence">
      <h3 className="lw-dash__label">Key evidence</h3>
      {body}
    </section>
  );
}
