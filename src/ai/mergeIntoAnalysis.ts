// Produces the one final analysis the panel shows, never local and AI results side by side.
// The recommendation label always comes from the deterministic engine, fed by whichever
// MatchResult is authoritative. Only the narrative text gets replaced by AI's wording.
import type { Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { ProfileEvidence } from "../models/evidence";
import type { MatchResult } from "../matching/scoreProfile";
import { buildProfileAnalysis, type ProfileAnalysis } from "../matching/profileAnalysis";
import { buildContactGuidance, type ContactGuidance } from "../matching/contactGuidance";
import type { AiConfidenceLevel, AiNarrativeDTO } from "./apiTypes";

export interface FinalAnalysis {
  result: MatchResult;
  analysis: ProfileAnalysis;
  guidance: ContactGuidance;
  source: "ai" | "local";
  /** Undefined for local-only analysis, which has no such judgment of its own. */
  confidenceLevel?: AiConfidenceLevel;
}

export interface AiAnalysisData {
  result: MatchResult;
  narrative: AiNarrativeDTO;
}

export function buildFinalAnalysis(
  goal: Goal,
  profile: LinkedInProfile,
  evidence: ProfileEvidence,
  localResult: MatchResult,
  ai?: AiAnalysisData,
): FinalAnalysis {
  const result = ai?.result ?? localResult;
  const templateAnalysis = buildProfileAnalysis(goal, profile, result, evidence);

  if (!ai) {
    return {
      result,
      analysis: templateAnalysis,
      guidance: buildContactGuidance(templateAnalysis.recommendation.label),
      source: "local",
    };
  }

  const analysis: ProfileAnalysis = {
    // A non-empty AI summary/strengths/gaps replaces the template's own. Falls back to the
    // template when AI's array ended up empty, so a real reason never disappears.
    summary: ai.narrative.summary ?? templateAnalysis.summary,
    strengths:
      ai.narrative.strengths.length > 0
        ? ai.narrative.strengths.map((s) => ({ label: s.title, detail: s.explanation }))
        : templateAnalysis.strengths,
    gaps: ai.narrative.gaps.length > 0 ? ai.narrative.gaps.map((g) => ({ label: g.title, detail: g.explanation })) : templateAnalysis.gaps,
    experienceLevel: ai.narrative.experienceAssessment,
    experienceLevelReason: ai.narrative.experienceAssessmentReason || undefined,
    recommendation: {
      // The label is never taken from AI directly, always the deterministic one, so a
      // guardrail-capped score can't be paired with an overly rosy recommendation.
      label: templateAnalysis.recommendation.label,
      // The reason text is free-form though, AI's explanation is more useful than the template's.
      reason: ai.narrative.recommendationReason || templateAnalysis.recommendation.reason,
    },
  };

  const templateGuidance = buildContactGuidance(analysis.recommendation.label);
  return {
    result,
    analysis,
    guidance: {
      ...templateGuidance,
      contactReason: ai.narrative.contactRecommendationReason || undefined,
      saveReason: ai.narrative.saveRecommendationReason || undefined,
    },
    source: "ai",
    confidenceLevel: ai.narrative.confidenceLevel,
  };
}
