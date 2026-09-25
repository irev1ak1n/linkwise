import type { JobCardAction } from "../../models/jobsSettings";

export interface CardEvidence {
  applied: boolean;
  matchedKeyword: string | null;
}

export interface JobFilterRules {
  appliedAction: JobCardAction;
  keywordAction: JobCardAction;
}

export function decideCardAction(evidence: CardEvidence, rules: JobFilterRules): JobCardAction {
  const appliedDecision = evidence.applied ? rules.appliedAction : "none";
  const keywordDecision = evidence.matchedKeyword ? rules.keywordAction : "none";

  if (appliedDecision === "hide" || keywordDecision === "hide") return "hide";
  if (appliedDecision === "highlight" || keywordDecision === "highlight") return "highlight";
  return "none";
}
