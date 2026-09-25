import type { JobCardAction } from "../../models/jobsSettings";

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
