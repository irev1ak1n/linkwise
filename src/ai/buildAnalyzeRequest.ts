// Builds the request body sent to POST /api/analyze-profile. Structured evidence only, never
// raw HTML or cookies. Re-evaluates every criterion (including EXCLUDED ones) directly, since
// computeMatchResult discards a non-disqualifying EXCLUDED result once it's not needed.
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
    /** Mirrors LinkedInProfile.extracted, since the backend never sees the real profile object. */
    profileExtracted: boolean;
    criterionResults: LocalCriterionResult[];
  };
}

// One honest local strength per criterion, EXCLUDED ones included, for the backend's guardrails.
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
