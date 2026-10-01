import type { JobCardAction, JobsSettings } from "../../models/jobsSettings";
import type { HighlightColor } from "../highlightPalette";

export interface CardEvidence {
  applied: boolean;
  viewed: boolean;
  saved: boolean;
  matchedKeyword: string | null;
}

export interface JobFilterRules {
  appliedAction: JobCardAction;
  viewedAction: JobCardAction;
  savedAction: JobCardAction;
  keywordAction: JobCardAction;
}

export function decideCardAction(evidence: CardEvidence, rules: JobFilterRules): JobCardAction {
  const decisions = [
    evidence.applied ? rules.appliedAction : "none",
    evidence.viewed ? rules.viewedAction : "none",
    evidence.saved ? rules.savedAction : "none",
    evidence.matchedKeyword ? rules.keywordAction : "none",
  ];

  if (decisions.includes("hide")) return "hide";
  if (decisions.includes("highlight")) return "highlight";
  return "none";
}

// When several highlighting rules match one card, the first in this order picks its color.
export function highlightColorFor(evidence: CardEvidence, settings: JobsSettings): HighlightColor {
  const reasons: [boolean, JobCardAction, HighlightColor][] = [
    [evidence.applied, settings.appliedAction, settings.appliedColor],
    [evidence.viewed, settings.viewedAction, settings.viewedColor],
    [evidence.saved, settings.savedAction, settings.savedColor],
    [evidence.matchedKeyword !== null, settings.keywordAction, settings.keywordColor],
  ];
  return reasons.find(([matched, action]) => matched && action === "highlight")?.[2] ?? settings.keywordColor;
}
