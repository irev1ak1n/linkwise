// The goal-specific reading of objective changes, kept apart from detecting them: the same new
// Product Manager role can matter to one goal and not another.
import type { Goal } from "../models/goal";
import type { EvidenceStrength } from "../models/evidence";
import type { FinalAnalysis } from "../ai/mergeIntoAnalysis";
import { detectDomains } from "../evidence/conceptGraph";
import { significantKeywords, stem } from "../matching/textNormalize";
import { contentWords } from "./textCompare";
import { isShown, type AnalysisSnapshot, type ChangeDirection, type GoalSnapshot, type MatchImpact, type ProfileChange, type SnapshotRecord } from "./types";

export function snapshotGoal(goal: Goal): GoalSnapshot {
  return { id: goal.id, name: goal.name, criteria: goal.criteria.map((c) => ({ id: c.id, label: c.label, importance: c.importance })) };
}

export function snapshotAnalysis(final: FinalAnalysis, goal: Goal): AnalysisSnapshot {
  const strengthOf = (id: string): EvidenceStrength =>
    final.result.reasons.find((r) => r.criterion.id === id)?.strength ?? final.result.missing.find((m) => m.criterion.id === id)?.strength ?? "unknown";
  return {
    matchScore: final.result.scorePercent,
    recommendation: final.analysis.recommendation.label,
    summary: final.analysis.summary,
    strengths: final.analysis.strengths.map((s) => s.label),
    gaps: final.analysis.gaps.map((g) => g.label),
    criteria: goal.criteria.map((c) => ({ id: c.id, label: c.label, strength: strengthOf(c.id) })),
    source: final.source,
  };
}

// Whether text speaks to a criterion: a shared specific keyword or a shared domain.
export function relevantTo(text: string, criterionLabel: string): boolean {
  const words = contentWords(text);
  if (significantKeywords(criterionLabel).some((word) => word.length >= 3 && words.has(stem(word)))) return true;
  const domains = detectDomains(criterionLabel);
  return domains.length > 0 && detectDomains(text).some((domain) => domains.includes(domain));
}

function changeText(change: ProfileChange, side: "previous" | "current"): string {
  return [change.subject, change[side], change.explanation].filter(Boolean).join(" ");
}

export function interpretForGoal(change: ProfileChange, goal: GoalSnapshot | null): ChangeDirection {
  const scoreable = goal?.criteria.filter((c) => c.importance !== "EXCLUDED") ?? [];
  const excluded = goal?.criteria.filter((c) => c.importance === "EXCLUDED") ?? [];
  if (scoreable.length === 0 && excluded.length === 0) return change.direction;
  const now = changeText(change, "current");
  const before = changeText(change, "previous");
  const relevantNow = scoreable.some((c) => relevantTo(now, c.label));
  const relevantBefore = scoreable.some((c) => relevantTo(before, c.label));
  switch (change.kind) {
    case "added":
    case "metric_added":
      if (excluded.some((c) => relevantTo(now, c.label))) return "weaker";
      return relevantNow ? "improved" : "changed";
    case "removed":
    case "metric_removed":
      return relevantBefore ? "weaker" : "changed";
    case "role_changed":
    case "company_changed":
    case "degree_changed":
      if (relevantNow && !relevantBefore) return "improved";
      if (relevantBefore && !relevantNow) return "weaker";
      return change.direction;
    default:
      return change.direction;
  }
}

const RANK: Record<EvidenceStrength, number> = { unknown: -1, missing: 0, weak: 1, moderate: 2, strong: 3 };

function sameGoal(a: GoalSnapshot | null, b: GoalSnapshot | null): boolean {
  if (!a || !b || a.id !== b.id) return false;
  const labels = (goal: GoalSnapshot) => goal.criteria.map((c) => `${c.label}|${c.importance}`).join("\n");
  return labels(a) === labels(b);
}

// Previous versus current Match, explained only by criteria whose assessed strength moved, and
// only linked to a change when that change's own text speaks to the criterion.
export function matchImpact(baseline: SnapshotRecord, goal: GoalSnapshot | null, analysis: AnalysisSnapshot | null, changes: ProfileChange[]): MatchImpact {
  const comparable = sameGoal(baseline.goal, goal);
  const previous = baseline.analysis?.matchScore ?? null;
  const current = analysis?.matchScore ?? null;
  const explanations: string[] = [];
  if (comparable && baseline.analysis && analysis) {
    const shown = changes.filter(isShown);
    for (const criterion of analysis.criteria) {
      const before = baseline.analysis.criteria.find((c) => c.id === criterion.id)?.strength ?? "unknown";
      const after = criterion.strength;
      if (after === "unknown" || RANK[after] === RANK[before]) continue;
      const stronger = RANK[after] > RANK[before];
      const linked = shown.filter((change) => relevantTo(changeText(change, stronger ? "current" : "previous"), criterion.label));
      const because = linked.map((change) => `${change.title.toLowerCase()} (${change.subject})`).join("; ");
      explanations.push(
        because
          ? `${criterion.label}: evidence became ${stronger ? "stronger" : "weaker"} with ${because}.`
          : `${criterion.label}: now assessed as ${stronger ? "stronger" : "weaker"}.`,
      );
    }
  }
  return {
    previous,
    current,
    delta: comparable && previous !== null && current !== null ? current - previous : null,
    sameGoal: comparable,
    previousGoalName: baseline.goal?.name ?? null,
    explanations,
  };
}
