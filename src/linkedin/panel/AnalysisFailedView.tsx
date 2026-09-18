interface AnalysisFailedViewProps {
  onRetry: () => void;
}

/**
 * Reached only when the whole pipeline (scan, criteria, scoring, AI) has been stuck in a loading
 * stage past its own patience budget (see PanelApp.tsx's PIPELINE_TIMEOUT_MS) — never shown as a
 * transient blip, and never alongside a fabricated score. One message, one action: the user
 * decides whether to try again, LinkWise never silently keeps retrying forever in the background
 * once it's told the user it gave up.
 */
export function AnalysisFailedView({ onRetry }: AnalysisFailedViewProps) {
  return (
    <div className="lw-failed">
      <p className="lw-failed__message">Analysis failed.</p>
      <button type="button" className="button button--primary" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
