interface NotEnoughInfoViewProps {
  goalName: string;
}

/**
 * Reached only when the background scan genuinely settled with zero extracted evidence (see
 * analysisPipeline.ts — this is the ONLY route left to this state; a missing/empty criteria
 * array is a LOADING stage, never this one). Never a fabricated 0% score standing in for
 * "nothing was found" — an honest, distinct message instead.
 */
export function NotEnoughInfoView({ goalName }: NotEnoughInfoViewProps) {
  return (
    <div className="lw-not-enough-info">
      <div className="lw-not-enough-info__title">Not Enough Info</div>
      <p className="lw-not-enough-info__note">
        LinkWise couldn't read enough of this profile to evaluate it against "{goalName}."
      </p>
    </div>
  );
}
