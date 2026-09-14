// Assembles the request body the extension sends to the LinkWise backend's
// POST /api/analyze-profile — normalized structured evidence only, never raw LinkedIn HTML,
// cookies, or anything beyond what matching already reads. Every criterion (including EXCLUDED
// ones) gets its own honest local strength: `computeMatchResult` deliberately discards a
// non-disqualifying EXCLUDED criterion's result once it knows the profile isn't disqualified,
// so this re-evaluates every criterion directly via the same local semantic matcher rather than
// trying to reconstruct that discarded information from the final MatchResult.
import type { Criterion, Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { EvidenceStrength } from "../models/evidence";
import type { MatchResult } from "../matching/scoreProfile";
import { evaluateCriterion } from "../matching/semanticMatcher";
import { buildProfileEvidence } from "../evidence/buildProfileEvidence";
import { buildEvidencePayload, findEvidenceId, type EvidencePayloadItem } from "./evidencePayload";

export interface AnalyzeRequestCriterion {
  id: string;
  label: string;
  importance: Criterion["importance"];
  category?: Criterion["category"];
}

export interface AnalyzeRequestGoal {
  id: string;
  description: string;
  criteria: AnalyzeRequestCriterion[];
}

export interface AnalyzeRequestProfile {
  identity: string;
  headline?: string;
  location?: string;
  evidence: EvidencePayloadItem[];
}

export interface LocalCriterionResult {
  criterionId: string;
  strength: EvidenceStrength;
  evidenceIds: string[];
}

export interface AnalyzeProfileRequestBody {
  goal: AnalyzeRequestGoal;
  profile: AnalyzeRequestProfile;
  localAnalysis: {
    score: number | null;
    confidence: number;
    /** Mirrors LinkedInProfile.extracted — the backend needs this explicitly since it never
     * sees the real LinkedInProfile object, only the flattened evidence list. */
    profileExtracted: boolean;
    criterionResults: LocalCriterionResult[];
  };
}

/** One honest local strength per criterion, independent of whatever `computeMatchResult` did
 * or didn't keep for display — the backend's guardrails need the real per-criterion floor for
 * every criterion, EXCLUDED ones included. */
export function buildLocalCriterionResults(
  goal: Goal,
  profile: LinkedInProfile,
  evidencePayload: EvidencePayloadItem[],
): LocalCriterionResult[] {
  const profileEvidence = buildProfileEvidence(profile);
  return goal.criteria.map((criterion) => {
    const evaluated = evaluateCriterion(criterion, profile, profileEvidence);
    const primary = evaluated.evidence ?? evaluated.partialEvidence;
    const evidenceId = primary ? findEvidenceId(evidencePayload, primary.sourceSection, primary.snippet) : undefined;
    return { criterionId: criterion.id, strength: evaluated.strength, evidenceIds: evidenceId ? [evidenceId] : [] };
  });
}

export function buildAnalyzeProfileRequest(goal: Goal, profile: LinkedInProfile, localResult: MatchResult): AnalyzeProfileRequestBody {
  const evidence = buildEvidencePayload(profile);
  return {
    goal: {
      id: goal.id,
      description: goal.name,
      criteria: goal.criteria.map((c) => ({ id: c.id, label: c.label, importance: c.importance, category: c.category })),
    },
    profile: {
      identity: profile.name ?? "unknown",
      headline: profile.headline,
      location: profile.location,
      evidence,
    },
    localAnalysis: {
      score: localResult.scorePercent,
      confidence: localResult.confidence,
      profileExtracted: localResult.profileExtracted,
      criterionResults: buildLocalCriterionResults(goal, profile, evidence),
    },
  };
}
