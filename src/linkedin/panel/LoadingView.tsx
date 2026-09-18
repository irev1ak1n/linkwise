interface LoadingViewProps {
  label: string;
}

/**
 * The entire "waiting on AI" experience — one spinner, one label, nothing else. Used only once
 * collection has already settled (see PanelApp.tsx's ScanningView for the collection-in-progress
 * stage) and the AI reasoning layer hasn't resolved yet: no local score, no partial summary, no
 * stale previous result ever renders underneath it. The final AnalysisView only ever mounts once
 * `aiState` is genuinely resolved (ready or unavailable) — see PanelApp.tsx's `renderProfileSection`.
 */
export function LoadingView({ label }: LoadingViewProps) {
  return (
    <div className="lw-loading">
      <div className="lw-loading__spinner" aria-hidden="true" />
      <p className="lw-loading__label" role="status">
        {label}
      </p>
    </div>
  );
}
