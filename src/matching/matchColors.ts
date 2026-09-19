// The one place that decides what color and label a Match % renders as. Every UI surface must
// go through matchDisplayState instead of re-deriving thresholds itself.
import type { MatchResult } from "./scoreProfile";

export type MatchBand = "low" | "potential" | "strong";

// 0-39 Low Match, 40-69 Potential Match, 70-100 Strong Match. Recalibrate only here if needed.
const STRONG_THRESHOLD = 70;
const POTENTIAL_THRESHOLD = 40;

// Below this confidence, a score is too speculative to show as a precise percentage.
const LOW_CONFIDENCE_THRESHOLD = 0.4;

export function matchBand(scorePercent: number): MatchBand {
  if (scorePercent >= STRONG_THRESHOLD) return "strong";
  if (scorePercent >= POTENTIAL_THRESHOLD) return "potential";
  return "low";
}

export const MATCH_BAND_LABELS: Record<MatchBand, string> = {
  low: "Low Match",
  potential: "Potential Match",
  strong: "Strong Match",
};

// Hex colors for the three bands, used directly by the inline-styled panel UI.
export const MATCH_BAND_COLORS: Record<MatchBand, string> = {
  low: "#c0392b",
  potential: "#8a6d00",
  strong: "#057642",
};

// Every state a score display can be in, beyond MatchBand, covering when a percentage would mislead.
export type MatchDisplayState =
  | { kind: "excluded" }
  | { kind: "not_enough_info" }
  | { kind: "low_confidence"; scorePercent: number; band: MatchBand }
  | { kind: MatchBand; scorePercent: number };

export function matchDisplayState(result: MatchResult): MatchDisplayState {
  if (result.disqualified) return { kind: "excluded" };
  if (result.scorePercent === null) return { kind: "not_enough_info" };

  const band = matchBand(result.scorePercent);
  if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { kind: "low_confidence", scorePercent: result.scorePercent, band };
  }
  return { kind: band, scorePercent: result.scorePercent };
}

export function matchDisplayLabel(state: MatchDisplayState): string {
  switch (state.kind) {
    case "excluded":
      return "Excluded";
    case "not_enough_info":
      return "Not Enough Info";
    case "low_confidence":
      return "Limited Profile Information";
    default:
      return MATCH_BAND_LABELS[state.kind];
  }
}

export function matchDisplayColor(state: MatchDisplayState): string {
  switch (state.kind) {
    case "excluded":
      return "#c0392b";
    case "not_enough_info":
      return "#56687a";
    case "low_confidence":
      return "#56687a";
    default:
      return MATCH_BAND_COLORS[state.kind];
  }
}
