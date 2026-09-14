// Deterministic scoring engine — combines a per-criterion evidence strength into one Match %,
// with full evidence preserved. The weighting/guardrail core (`computeMatchResult`) is a pure
// function of a Goal and an already-resolved strength for every criterion — it does not care
// WHERE that strength came from. `scoreProfileAgainstGoal` is the local, fully-deterministic
// path (feeds it from semanticMatcher.ts, no network, no AI). The backend's OpenAI integration
// (see backend/src/scoring.ts) reuses this exact same `computeMatchResult` core, fed instead by
// AI-assessed + guardrail-merged strengths — so there is only ONE place the weight allocation,
// Must-Have caps, and Excluded-disqualification logic lives, no matter which path produced the
// per-criterion strengths. This is what makes "OpenAI improves criterion understanding, but the
// final Match % stays deterministic" possible without duplicating the scoring math.
//
// No neural embedding model is used for the underlying LOCAL evidence matching (see
// semanticMatcher.ts). Benchmarked before deciding: bundling Transformers.js plus a small
// quantized embedding model (Xenova/all-MiniLM-L6-v2) would add roughly 30-35MB — the JS
// runtime package alone is ~9.5MB unpacked, and the model's own quantized ONNX weights are
// ~22-25MB (its fp32 weights, measured directly, are 90MB) — against a content-script bundle
// that is currently ~215KB. Under this project's current architecture the in-page panel (and
// therefore this scoring engine) runs INSIDE the LinkedIn content script, so a model that size
// would need to load and run WASM inference on every profile page visit, which is exactly the
// kind of heavy main-thread work that caused a real page-freeze bug earlier in this project.
// Real semantic reasoning is instead done server-side (OpenAI, see backend/), reached only via
// the extension's own backend — never bundled into the content script.
import type { Criterion, CriterionImportance, Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { EvidenceStrength } from "../models/evidence";
import { buildProfileEvidence } from "../evidence/buildProfileEvidence";
import { evaluateCriterion, type SemanticEvidence } from "./semanticMatcher";

export interface MatchReason {
  criterion: Criterion;
  /** Only ever "strong" or "moderate" here — weaker evidence lives in `missing` instead, so
   * "why they match" never lists something barely relevant as if it were a real strength. */
  strength: Extract<EvidenceStrength, "strong" | "moderate">;
  evidence: SemanticEvidence;
  explanation: string;
}

export interface MissingItem {
  criterion: Criterion;
  /** "weak" (some related-but-inconclusive context), "missing" (confirmed absent from a
   * reasonably-read profile), or "unknown" (not enough of the profile has loaded to judge) —
   * kept distinct so the UI never presents "we haven't looked yet" as "this isn't there". */
  strength: Extract<EvidenceStrength, "weak" | "missing" | "unknown">;
  note?: string;
}

export interface MatchResult {
  /** null only when the goal has no scoreable (non-EXCLUDED) criteria at all — there is
   * nothing to compute a percentage from, so showing 0% or 100% would both be misleading. */
  scorePercent: number | null;
  /** True when an EXCLUDED criterion was found with STRONG confirmed evidence — moderate/weak
   * evidence for an excluded trait is not confident enough to disqualify on its own. */
  disqualified: boolean;
  reasons: MatchReason[];
  missing: MissingItem[];
  /** False whenever at least one MUST_HAVE criterion did not resolve to strong/moderate
   * evidence — the "show an honest incomplete state rather than a misleading percentage"
   * requirement. The UI uses this to caveat the score rather than presenting it as final. */
  complete: boolean;
  /** Mirrors LinkedInProfile.extracted — lets the UI distinguish "scored, but incomplete
   * because required info is missing" from "nothing could be read from this page at all." */
  profileExtracted: boolean;
  /**
   * 0-1: how much of the goal's total weighted importance was actually assessable (not
   * "unknown") — a 75% score built on full evidence is not the same claim as 75% built on a
   * headline alone. The UI shows "Limited profile information" instead of a bare percentage
   * when this is low (see matchColors.ts's `isLowConfidence`).
   */
  confidence: number;
}

/** Starting weight allocation across the three scoreable importance tiers — a fixed
 * percentage split, not a per-criterion count-based weight, specifically so that adding more
 * Optional criteria can never dilute how much a missing Must-Have costs (see the scoring walk
 * below). Divided evenly among however many criteria exist in each tier. */
const CATEGORY_WEIGHT: Record<Exclude<CriterionImportance, "EXCLUDED">, number> = {
  MUST_HAVE: 55,
  PREFERRED: 30,
  OPTIONAL: 15,
};

/** How much of a criterion's allocated weight it earns, by evidence strength. "unknown" has no
 * entry here on purpose — it is excluded from both the earned and possible totals entirely
 * (see the weighted-average walk below), never treated as a confirmed 0. */
const STRENGTH_MULTIPLIER: Record<Extract<EvidenceStrength, "strong" | "moderate" | "weak" | "missing">, number> = {
  strong: 1.0,
  moderate: 0.7,
  weak: 0.35,
  missing: 0.0,
};

function isReasonStrength(strength: EvidenceStrength): strength is "strong" | "moderate" {
  return strength === "strong" || strength === "moderate";
}

/** One criterion's already-resolved outcome — the input `computeMatchResult` needs for EVERY
 * criterion in the goal. `evidence` is only meaningful for strong/moderate (becomes a
 * `MatchReason`); `note` is only meaningful for weak/missing/unknown (becomes a `MissingItem`'s
 * note) — both may be omitted when there's nothing real to show. */
export interface CriterionAssessment {
  strength: EvidenceStrength;
  evidence?: SemanticEvidence;
  note?: string;
  explanation: string;
}

/**
 * The deterministic weighting/guardrail core: Must-Have/Preferred/Optional weight allocation,
 * strength multipliers, Unknown-excluded-from-both-sums, and Excluded-disqualification — a pure
 * function of a Goal and an already-resolved assessment for every criterion. Doesn't know or
 * care whether those assessments came from the local semantic matcher (see
 * `scoreProfileAgainstGoal` below) or from a guardrail-merged OpenAI response (see
 * backend/src/scoring.ts) — either way, the exact same rules apply, which is what makes "OpenAI
 * can improve per-criterion understanding but never bypass the Must-Have cap, the Excluded
 * disqualification, or the Unknown-vs-Missing distinction" true by construction rather than by
 * convention. A criterion with no entry in `assessments` is treated as "unknown" — never a
 * silent 0 — since the only honest reading of "nobody assessed this" is "not enough information
 * to judge," not "confirmed absent."
 */
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

    if (assessment.strength === "unknown") continue; // excluded from both sums — never a confirmed 0, never free credit

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

/** The fully local, deterministic path — no network, no AI. Evaluates every criterion via the
 * semantic matcher, then hands the results to the same `computeMatchResult` core the AI-enhanced
 * backend path also uses. This is also LinkWise's fallback whenever the backend/OpenAI is
 * unavailable, so its output must stay exactly what it's always been. */
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
