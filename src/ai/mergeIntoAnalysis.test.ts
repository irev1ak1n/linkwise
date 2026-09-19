import { describe, expect, it } from "vitest";
import { buildFinalAnalysis } from "./mergeIntoAnalysis";
import { scoreProfileAgainstGoal } from "../matching/scoreProfile";
import { buildProfileEvidence } from "../evidence/buildProfileEvidence";
import { createCriterion, createGoal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { AiNarrativeDTO } from "./apiTypes";

function profile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
  return {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    organizations: [],
    volunteering: [],
    languages: [],
    extracted: true,
    ...overrides,
  };
}

function narrative(overrides: Partial<AiNarrativeDTO> = {}): AiNarrativeDTO {
  return {
    strengths: [],
    gaps: [],
    experienceAssessment: "relevant",
    experienceAssessmentReason: "x",
    recommendationReason: "x",
    contactRecommendationReason: "x",
    saveRecommendationReason: "x",
    confidenceLevel: "medium",
    ...overrides,
  };
}

describe("buildFinalAnalysis - no AI available", () => {
  it("falls back to the local template analysis entirely, marking the source as local", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult);
    expect(final.source).toBe("local");
    expect(final.result).toBe(localResult);
  });
});

describe("buildFinalAnalysis - AI available", () => {
  it("uses the AI-provided MatchResult (guardrail-merged) as the authoritative result", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);
    const aiResult = { ...localResult, scorePercent: 55 }; // pretend the backend returned a different (guardrail-applied) score

    const final = buildFinalAnalysis(goal, p, evidence, localResult, { result: aiResult, narrative: narrative() });
    expect(final.source).toBe("ai");
    expect(final.result.scorePercent).toBe(55);
  });

  it("replaces the summary/strengths/gaps with AI's validated narrative when non-empty", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult, {
      result: localResult,
      narrative: narrative({
        summary: "AI-written summary.",
        strengths: [{ title: "Strong Python", explanation: "Lists Python as a skill.", evidenceIds: ["skills:0"] }],
      }),
    });

    expect(final.analysis.summary).toBe("AI-written summary.");
    expect(final.analysis.strengths).toEqual([{ label: "Strong Python", detail: "Lists Python as a skill." }]);
  });

  it("falls back to the template's strengths when AI's validated strengths ended up empty", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult, { result: localResult, narrative: narrative({ strengths: [] }) });
    expect(final.analysis.strengths.length).toBeGreaterThan(0); // the template DID find a real strength here
  });

  it("NEVER takes the recommendation from AI directly — always the deterministic label for the final MatchResult", () => {
    const goal = {
      ...createGoal("Test"),
      criteria: [createCriterion("FRC mentor", "MUST_HAVE"), createCriterion("Python", "MUST_HAVE")],
    };
    const p = profile({ about: "I enjoy hiking." }); // matches nothing, should read as weak/no match
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    // Even if AI's narrative reason sounds enthusiastic, the label is still computed
    // deterministically from the MatchResult, never overridden by AI's tone.
    const final = buildFinalAnalysis(goal, p, evidence, localResult, {
      result: localResult,
      narrative: narrative({ recommendationReason: "This looks like an amazing candidate!" }),
    });
    expect(final.analysis.recommendation.label).toBe("Not worth prioritizing for this goal");
  });

  it("derives the experience level from AI's narrative when AI is available", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult, { result: localResult, narrative: narrative({ experienceAssessment: "extensive" }) });
    expect(final.analysis.experienceLevel).toBe("extensive");
  });

  it("uses AI's recommendationReason text for the reason (only the label stays deterministic)", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult, {
      result: localResult,
      narrative: narrative({ recommendationReason: "His Python skill is a strong direct match, with no other gaps found." }),
    });
    expect(final.analysis.recommendation.reason).toBe("His Python skill is a strong direct match, with no other gaps found.");
  });

  it("carries experienceLevelReason and contact/save reasons from AI's narrative", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult, {
      result: localResult,
      narrative: narrative({
        experienceAssessmentReason: "Direct Python skill is listed on the profile.",
        contactRecommendationReason: "Worth a quick message to confirm depth.",
        saveRecommendationReason: "Keep for this search.",
      }),
    });
    expect(final.analysis.experienceLevelReason).toBe("Direct Python skill is listed on the profile.");
    expect(final.guidance.contactReason).toBe("Worth a quick message to confirm depth.");
    expect(final.guidance.saveReason).toBe("Keep for this search.");
  });

  it("exposes AI's own confidenceLevel at the top level", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult, { result: localResult, narrative: narrative({ confidenceLevel: "low" }) });
    expect(final.confidenceLevel).toBe("low");
  });

  it("leaves confidenceLevel undefined for local-only analysis", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult);
    expect(final.confidenceLevel).toBeUndefined();
  });

  it("leaves experienceLevelReason and contact/save reasons undefined for local-only analysis", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const localResult = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);

    const final = buildFinalAnalysis(goal, p, evidence, localResult);
    expect(final.analysis.experienceLevelReason).toBeUndefined();
    expect(final.guidance.contactReason).toBeUndefined();
    expect(final.guidance.saveReason).toBeUndefined();
  });
});
