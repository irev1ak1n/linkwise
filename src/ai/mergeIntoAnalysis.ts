// The extension-side merge point that produces the ONE final LinkWise analysis the panel shows
// — never "one local score plus one AI score plus another recommendation" as separate,
// possibly-conflicting displays (see the mission's own "avoid duplicate/conflicting analyses").
// The Match %, disqualification, and recommendation ALWAYS come from the deterministic engine
// (`buildProfileAnalysis`, fed by whichever MatchResult is authoritative — AI-guardrailed when
// available, local-only otherwise); only the narrative text (summary/strengths/gaps) is
// replaced by OpenAI's richer, already-validated wording when it produced something useful.
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
  /** OpenAI's own categorical confidence label — undefined for local-only analysis, which has
   * no such judgment of its own beyond the numeric MatchResult.confidence. */
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
    // A validated, non-empty AI summary/strengths/gaps replaces the template's own — richer,
    // still fully evidence-traceable (see backend/src/guardrails/validateNarrative.ts). An
    // empty AI array (nothing survived validation) falls back to the template's own so the
    // user is never shown an empty "Why they match" section when there was a real reason.
    summary: ai.narrative.summary ?? templateAnalysis.summary,
    strengths:
      ai.narrative.strengths.length > 0
        ? ai.narrative.strengths.map((s) => ({ label: s.title, detail: s.explanation }))
        : templateAnalysis.strengths,
    gaps: ai.narrative.gaps.length > 0 ? ai.narrative.gaps.map((g) => ({ label: g.title, detail: g.explanation })) : templateAnalysis.gaps,
    experienceLevel: ai.narrative.experienceAssessment,
    experienceLevelReason: ai.narrative.experienceAssessmentReason || undefined,
    recommendation: {
      // The LABEL is NEVER taken from AI directly — always the deterministic label computed
      // from the (possibly AI-informed) MatchResult, so a guardrail-capped score can never be
      // paired with an overly rosy recommendation OpenAI happened to suggest.
      label: templateAnalysis.recommendation.label,
      // The REASON *text* alongside that label, however, is free-form narrative — AI's grounded,
      // goal-specific explanation (naming the strongest reason and the largest gap) is more
      // useful to the user than the template's generic phrase, and citing it can never change
      // what recommendation is actually shown.
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
