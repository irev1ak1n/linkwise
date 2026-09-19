// Deterministic scoring engine, combines a per-criterion evidence strength into one Match %.
// computeMatchResult is a pure function of a Goal and a strength for every criterion, it
// doesn't care where that strength came from. scoreProfileAgainstGoal is the local, no-AI path.
// The backend reuses this exact same core, fed by AI-assessed strengths instead, so the
// weighting and guardrail logic lives in exactly one place either way.
//
// No neural embedding model for local matching. A quantized model would add 30MB+ to a
// content-script bundle that's currently ~215KB, and would mean running WASM inference on
// every page visit. Real semantic reasoning happens server-side instead (see backend/).
import type { Criterion, CriterionImportance, Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { EvidenceStrength } from "../models/evidence";
import { buildProfileEvidence } from "../evidence/buildProfileEvidence";
import { evaluateCriterion, type SemanticEvidence } from "./semanticMatcher";

export interface MatchReason {
  criterion: Criterion;
  /** Only ever strong or moderate, weaker evidence lives in missing instead. */
  strength: Extract<EvidenceStrength, "strong" | "moderate">;
  evidence: SemanticEvidence;
  explanation: string;
}

export interface MissingItem {
  criterion: Criterion;
  /** weak, missing, or unknown, kept distinct so "haven't looked yet" never reads as "not there". */
  strength: Extract<EvidenceStrength, "weak" | "missing" | "unknown">;
  note?: string;
}

export interface MatchResult {
  /** Null only when the goal has no scoreable criteria at all, nothing to compute a percentage from. */
  scorePercent: number | null;
  /** True only for a STRONG confirmed EXCLUDED criterion, moderate/weak isn't confident enough. */
  disqualified: boolean;
  reasons: MatchReason[];
  missing: MissingItem[];
  /** False when a MUST_HAVE criterion didn't resolve, so the UI can caveat the score. */
  complete: boolean;
  /** Mirrors LinkedInProfile.extracted, lets the UI tell "incomplete" apart from "nothing read". */
  profileExtracted: boolean;
  /** 0-1, how much of the goal's weight was actually assessable. A 75% score on full evidence
   * isn't the same claim as 75% on a headline alone. */
  confidence: number;
}

// Fixed percentage split across the three tiers, so adding more Optional criteria can never
// dilute how much a missing Must-Have costs. Divided evenly within each tier.
const CATEGORY_WEIGHT: Record<Exclude<CriterionImportance, "EXCLUDED">, number> = {
  MUST_HAVE: 55,
  PREFERRED: 30,
  OPTIONAL: 15,
};

// How much of a criterion's weight it earns by strength. "unknown" has no entry on purpose,
// it's excluded from the sums entirely, never treated as a confirmed 0.
const STRENGTH_MULTIPLIER: Record<Extract<EvidenceStrength, "strong" | "moderate" | "weak" | "missing">, number> = {
  strong: 1.0,
  moderate: 0.7,
  weak: 0.35,
  missing: 0.0,
};

function isReasonStrength(strength: EvidenceStrength): strength is "strong" | "moderate" {
  return strength === "strong" || strength === "moderate";
}

// One criterion's resolved outcome. evidence matters for strong/moderate, note for
// weak/missing/unknown. Both can be omitted when there's nothing to show.
export interface CriterionAssessment {
  strength: EvidenceStrength;
  evidence?: SemanticEvidence;
  note?: string;
  explanation: string;
}

// The deterministic weighting/guardrail core. A pure function of a Goal and an assessment for
// every criterion, doesn't care whether those came from local matching or a guardrail-merged
// AI response. A criterion missing from assessments is treated as "unknown", never a silent 0.
export function computeMatchResult(
  goal: Goal,
  assessments: ReadonlyMap<string, CriterionAssessment>,
  profileExtracted: boolean,
): MatchResult {
  const reasons: MatchReason[] = [];
  const missing: MissingItem[] = [];

  function assessmentFor(criterion: Criterion): CriterionAssessment {
    return assessments.get(criterion.id) ?? { strength: "unknown", explanation: "No assessment available for this criterion." };
  }

  const excludedCriteria = goal.criteria.filter((c) => c.importance === "EXCLUDED");
  for (const criterion of excludedCriteria) {
    const assessment = assessmentFor(criterion);
    if (assessment.strength === "strong" && assessment.evidence) {
      return {
        scorePercent: 0,
        disqualified: true,
        reasons: [],
        missing: [],
        complete: profileExtracted,
        profileExtracted,
        confidence: 1,
      };
    }
  }

  const scoreable = goal.criteria.filter(
    (c): c is Criterion & { importance: Exclude<CriterionImportance, "EXCLUDED"> } => c.importance !== "EXCLUDED",
  );

  if (scoreable.length === 0) {
    return {
      scorePercent: null,
      disqualified: false,
      reasons,
      missing,
      complete: profileExtracted,
      profileExtracted,
      confidence: 0,
    };
  }

  const countByCategory: Record<Exclude<CriterionImportance, "EXCLUDED">, number> = {
    MUST_HAVE: 0,
    PREFERRED: 0,
    OPTIONAL: 0,
  };
  for (const criterion of scoreable) countByCategory[criterion.importance] += 1;

  let mustHaveUnsatisfied = false;
  let knownWeightSum = 0;
  let knownEarnedSum = 0;
  let totalWeightSum = 0;

  for (const criterion of scoreable) {
    const nominalWeight = CATEGORY_WEIGHT[criterion.importance] / countByCategory[criterion.importance];
    totalWeightSum += nominalWeight;

    const assessment = assessmentFor(criterion);

    if (isReasonStrength(assessment.strength)) {
      reasons.push({ criterion, strength: assessment.strength, evidence: assessment.evidence!, explanation: assessment.explanation });
    } else {
      missing.push({ criterion, strength: assessment.strength, note: assessment.note });
    }

    if (criterion.importance === "MUST_HAVE" && !isReasonStrength(assessment.strength)) {
      mustHaveUnsatisfied = true;
    }

    if (assessment.strength === "unknown") continue; // excluded from both sums, never a confirmed 0

    knownWeightSum += nominalWeight;
    knownEarnedSum += nominalWeight * STRENGTH_MULTIPLIER[assessment.strength];
  }

  const scorePercent = knownWeightSum > 0 ? Math.round((knownEarnedSum / knownWeightSum) * 100) : null;
  const confidence = totalWeightSum > 0 ? knownWeightSum / totalWeightSum : 0;

  return {
    scorePercent,
    disqualified: false,
    reasons,
    missing,
    complete: profileExtracted && !mustHaveUnsatisfied,
    profileExtracted,
    confidence,
  };
}

// The fully local path, no network, no AI. Also the fallback when the backend is unavailable.
export function scoreProfileAgainstGoal(goal: Goal, profile: LinkedInProfile): MatchResult {
  const evidence = buildProfileEvidence(profile);
  const assessments = new Map<string, CriterionAssessment>();
  for (const criterion of goal.criteria) {
    const result = evaluateCriterion(criterion, profile, evidence);
    assessments.set(criterion.id, {
      strength: result.strength,
      evidence: result.evidence,
      note: result.partialEvidence?.snippet ?? result.explanation,
      explanation: result.explanation,
    });
  }
  return computeMatchResult(goal, assessments, profile.extracted);
}
