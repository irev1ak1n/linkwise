interface LoadingViewProps {
  label: string;
}

// The entire "waiting on AI" experience, one spinner and one label, nothing else. Used once
// collection has settled but AI hasn't resolved yet, so no partial result ever shows.
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
