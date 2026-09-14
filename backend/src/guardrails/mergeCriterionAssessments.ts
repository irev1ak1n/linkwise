// The single guardrail policy deciding, PER CRITERION, whether to trust OpenAI's assessment or
// fall back to the local deterministic one. This is what keeps "OpenAI improves criterion
// understanding" from ever becoming "OpenAI can invent an unsupported fact" or "OpenAI can
// override a hard guardrail" — the merged result this produces is what feeds
// computeMatchResult (see ../../../src/matching/scoreProfile.ts), so every rule enforced here
// applies before the score is even calculated, not after.
//
// The policy, in order:
//   1. If the LOCAL result is "unknown", trust it completely and ignore AI for this criterion.
//      Only the local engine actually knows whether enough of the profile was collected —
//      OpenAI sees the same evidence list either way, so it has no additional information
//      about collection completeness, and letting it assert something more confident here
//      would be trusting a claim it has no real basis for.
//   2. If the criterion is EXCLUDED and local already confirmed it ("strong"), that
//      disqualification can never be undone by AI — a confirmed exclusion is a hard guardrail.
//   3. If AI didn't address this criterion at all, keep the local result.
//   4. If AI claims a positive strength (strong/moderate/weak) but cites zero evidence IDs that
//      were actually supplied in the request, the claim is unsupported — fall back to local.
//   5. If AI claims "unknown" while local already resolved a real answer, that would introduce
//      LESS certainty than the system already has — keep local instead.
//   6. Otherwise, AI provided a grounded, non-regressive assessment — use it. This is the case
//      that actually delivers "AI improves on exact-keyword matching": a locally "missing" or
//      "weak" criterion can be upgraded when OpenAI cites real evidence a keyword/concept-graph
//      match didn't catch.
//
// A "strong"/"moderate" assessment is REQUIRED to carry real evidence by the time it reaches
// computeMatchResult (it becomes a MatchReason, which the UI unconditionally reads `.evidence`
// from) — this file guarantees that invariant for both the local and AI-derived paths, never
// just assuming it holds.
import type { CriterionAssessment } from "../../../src/matching/scoreProfile";
import type { SemanticEvidence } from "../../../src/matching/semanticMatcher";
import type { EvidenceStrength } from "../../../src/models/evidence";
import type { AnalyzeProfileRequest } from "../validation/requestSchema";
import type { AnalysisResponse, CriterionAssessmentResponse } from "../openai/responseSchema";

export interface MergeResult {
  assessments: Map<string, CriterionAssessment>;
  /** Which criterion IDs actually used a grounded AI assessment rather than the local floor —
   * exposed for logging/debugging and for the narrative validator to cross-check against. */
  aiInformedCriterionIds: Set<string>;
}

function isPositiveStrength(strength: EvidenceStrength): boolean {
  return strength === "strong" || strength === "moderate" || strength === "weak";
}

function toSemanticEvidence(section: string, text: string): SemanticEvidence {
  return { fieldLabel: section, snippet: text, sourceSection: section as SemanticEvidence["sourceSection"] };
}

/** Filters an AI-cited evidence ID list down to only IDs that were genuinely supplied in the
 * request — never trust a citation to evidence that doesn't exist (see the mission's own "AI
 * may only reference evidence IDs provided in the request" rule). */
function keepValidEvidenceIds(evidenceIds: string[], suppliedIds: ReadonlySet<string>): string[] {
  return evidenceIds.filter((id) => suppliedIds.has(id));
}

/** Reconstructs the local floor as a `CriterionAssessment`, defensively downgrading a
 * positive claim ("strong"/"moderate") that somehow has no resolvable evidence ID down to
 * "weak" — a positive claim must never reach `computeMatchResult` without real evidence behind
 * it, even in a degenerate case the request-building step didn't anticipate. */
function buildLocalAssessment(
  request: AnalyzeProfileRequest,
  evidenceById: ReadonlyMap<string, AnalyzeProfileRequest["profile"]["evidence"][number]>,
  criterionId: string,
): CriterionAssessment {
  const local = request.localAnalysis.criterionResults.find((r) => r.criterionId === criterionId);
  if (!local) {
    return { strength: "unknown", explanation: "No local assessment available for this criterion." };
  }

  const firstEvidence = local.evidenceIds[0] ? evidenceById.get(local.evidenceIds[0]) : undefined;

  if (isPositiveStrength(local.strength) && !firstEvidence) {
    return { strength: "weak", explanation: "Local match found but its supporting evidence could not be resolved." };
  }

  return {
    strength: local.strength,
    evidence: firstEvidence ? toSemanticEvidence(firstEvidence.section, firstEvidence.text) : undefined,
    note: firstEvidence ? undefined : "No local evidence found for this criterion.",
    explanation: "Assessed by LinkWise's local deterministic matcher.",
  };
}

export function mergeCriterionAssessments(request: AnalyzeProfileRequest, aiResponse: AnalysisResponse): MergeResult {
  const suppliedEvidenceIds = new Set(request.profile.evidence.map((e) => e.id));
  const evidenceById = new Map(request.profile.evidence.map((e) => [e.id, e]));
  const aiByCriterionId = new Map<string, CriterionAssessmentResponse>(aiResponse.criterionAssessments.map((a) => [a.criterionId, a]));

  const assessments = new Map<string, CriterionAssessment>();
  const aiInformedCriterionIds = new Set<string>();

  for (const criterion of request.goal.criteria) {
    const localAssessment = buildLocalAssessment(request, evidenceById, criterion.id);

    // Rule 1: local "unknown" is authoritative — only it tracks collection completeness.
    if (localAssessment.strength === "unknown") {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    // Rule 2: a confirmed Excluded disqualification can never be undone by AI.
    if (criterion.importance === "EXCLUDED" && localAssessment.strength === "strong") {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    const ai = aiByCriterionId.get(criterion.id);
    // Rule 3: AI didn't address this criterion.
    if (!ai) {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    const grounded = keepValidEvidenceIds(ai.evidenceIds, suppliedEvidenceIds);
    const groundedEvidence = grounded[0] ? evidenceById.get(grounded[0]) : undefined;

    // Rule 4: an unsupported positive claim is rejected outright.
    if (isPositiveStrength(ai.assessment) && !groundedEvidence) {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    // Rule 5: AI cannot introduce MORE uncertainty than the system already resolved.
    if (ai.assessment === "unknown") {
      assessments.set(criterion.id, localAssessment);
      continue;
    }

    // Rule 6: grounded, non-regressive — use AI's assessment. `groundedEvidence` is guaranteed
    // whenever `ai.assessment` is a positive strength (Rule 4 already excluded the alternative).
    assessments.set(criterion.id, {
      strength: ai.assessment,
      evidence: groundedEvidence ? toSemanticEvidence(groundedEvidence.section, groundedEvidence.text) : undefined,
      note: ai.rationale,
      explanation: ai.rationale,
    });
    aiInformedCriterionIds.add(criterion.id);
  }

  return { assessments, aiInformedCriterionIds };
}
