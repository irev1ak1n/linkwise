interface LoadingViewProps {
  label: string;
}

/**
 * The ENTIRE loading experience for the invisible background-analysis pipeline — one spinner,
 * one stage label, nothing else. See analysisPipeline.ts's own doc comment: every one of the
 * "Scanning profile…" / "Understanding your goal…" / "Calculating match…" / "Finalizing
 * analysis…" labels renders through this exact same component, so there is structurally no way
 * for a provisional percentage, a partial summary, or a stale previous result to leak out during
 * any of them — this component doesn't even receive a score or evidence to render one from.
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
