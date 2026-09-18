import { describe, expect, it } from "vitest";
import { computeFinalScore, confidenceLevelToFloat } from "./scoring";
import { mergeCriterionAssessments } from "./guardrails/mergeCriterionAssessments";
import { analyzeProfileRequestSchema, type AnalyzeProfileRequest } from "./validation/requestSchema";
import type { AnalysisResponse } from "./openai/responseSchema";

function request(overrides: Partial<AnalyzeProfileRequest> = {}): AnalyzeProfileRequest {
  return analyzeProfileRequestSchema.parse({
    goal: { id: "g1", description: "Test", criteria: [{ id: "c1", label: "FRC mentor", importance: "MUST_HAVE" }] },
    profile: { identity: "Jordan Rivera", evidence: [] },
    localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "c1", strength: "missing", evidenceIds: [] }] },
    ...overrides,
  });
}

function aiResponse(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    matchPercent: 50,
    confidenceLevel: "medium",
    criterionAssessments: [],
    summary: "Summary",
    strengths: [],
    gaps: [],
    experienceAssessment: "relevant",
    experienceAssessmentReason: "Reason",
    recommendation: "worth_contacting",
    recommendationReason: "Reason",
    contactRecommendation: "maybe",
    contactRecommendationReason: "Reason",
    saveRecommendation: "consider_saving",
    saveRecommendationReason: "Reason",
    ...overrides,
  };
}

describe("computeFinalScore - AI's own matchPercent is authoritative", () => {
  it("uses AI's matchPercent as the displayed score, even when a Must Have is unresolved locally", () => {
    const req = request({
      goal: {
        id: "g1",
        description: "Test",
        criteria: [
          { id: "c1", label: "FRC mentor", importance: "MUST_HAVE" },
          { id: "c2", label: "Python", importance: "OPTIONAL" },
        ],
      },
      localAnalysis: {
        score: null,
        confidence: 0,
        profileExtracted: true,
        criterionResults: [
          { criterionId: "c1", strength: "missing", evidenceIds: [] },
          { criterionId: "c2", strength: "strong", evidenceIds: ["skills:0"] },
        ],
      },
      profile: { identity: "x", evidence: [{ id: "skills:0", section: "skills", text: "Python", evidenceType: "skills" }] },
    });
    const ai = aiResponse({ matchPercent: 85 });
    const merge = mergeCriterionAssessments(req, ai);
    const result = computeFinalScore(req, merge, ai);
    // The score itself is no longer capped by the deterministic weighted-average engine — it's
    // AI's own number, passed straight through.
    expect(result.scorePercent).toBe(85);
    // The Must-Have-unresolved caveat still comes through independently via `complete`, which
    // stays deterministic (derived from the guardrail-merged per-criterion assessments) — the
    // UI still shows its "a Must-Have criterion could not be confirmed" note regardless of score.
    expect(result.complete).toBe(false);
  });

  it("clamps an out-of-range matchPercent as a last-resort defense, even though upstream validation should already prevent one", () => {
    const req = request();
    const ai = aiResponse({ matchPercent: 500 as unknown as number });
    const merge = mergeCriterionAssessments(req, ai);
    const result = computeFinalScore(req, merge, ai);
    expect(result.scorePercent).toBe(100);
  });

  it("maps confidenceLevel onto the 0-1 MatchResult.confidence scale used by the low-confidence UI gate", () => {
    const req = request();
    const ai = aiResponse({ confidenceLevel: "low" });
    const merge = mergeCriterionAssessments(req, ai);
    const result = computeFinalScore(req, merge, ai);
    expect(result.confidence).toBeLessThan(0.4); // below matchColors.ts's LOW_CONFIDENCE_THRESHOLD
  });

  it("keeps a medium/high confidenceLevel above the low-confidence threshold — a strong score with only medium confidence is still shown as a normal result", () => {
    const req = request();
    const mediumAi = aiResponse({ confidenceLevel: "medium" });
    const mediumResult = computeFinalScore(req, mergeCriterionAssessments(req, mediumAi), mediumAi);
    expect(mediumResult.confidence).toBeGreaterThanOrEqual(0.4);

    const highAi = aiResponse({ confidenceLevel: "high" });
    const highResult = computeFinalScore(req, mergeCriterionAssessments(req, highAi), highAi);
    expect(highResult.confidence).toBeGreaterThan(mediumResult.confidence);
  });
});

describe("computeFinalScore - Excluded criterion guardrail", () => {
  it("disqualifies the match when the merged assessment confirms a strong exclusion, even against an enthusiastic AI score", () => {
    const req = request({
      goal: { id: "g1", description: "Test", criteria: [{ id: "c1", label: "recruiter", importance: "EXCLUDED" }] },
      localAnalysis: {
        score: 0,
        confidence: 1,
        profileExtracted: true,
        criterionResults: [{ criterionId: "c1", strength: "strong", evidenceIds: ["headline:0"] }],
      },
      profile: { identity: "x", evidence: [{ id: "headline:0", section: "headline", text: "Technical Recruiter", evidenceType: "headline" }] },
    });
    const ai = aiResponse({ matchPercent: 90 });
    const merge = mergeCriterionAssessments(req, ai);
    const result = computeFinalScore(req, merge, ai);
    expect(result.disqualified).toBe(true);
    expect(result.scorePercent).toBe(0);
  });
});

describe("computeFinalScore - AI score used even when the local per-criterion floor is unknown", () => {
  it("still shows AI's own matchPercent rather than falling back to a null score", () => {
    // Under the AI-first architecture, a locally-"unknown" per-criterion floor no longer forces
    // a null displayed score — OpenAI reasons from the same evidence (plus the goal's own free
    // text) and can still produce a genuine, grounded matchPercent even where the coarser local
    // keyword matcher couldn't resolve one specific criterion.
    const unknownReq = request({
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "c1", strength: "unknown", evidenceIds: [] }] },
    });
    const ai = aiResponse({ matchPercent: 40 });
    const merge = mergeCriterionAssessments(unknownReq, ai);
    const result = computeFinalScore(unknownReq, merge, ai);
    expect(result.scorePercent).toBe(40);
  });
});

describe("confidenceLevelToFloat", () => {
  it("maps every enum value into the [0, 1] range", () => {
    expect(confidenceLevelToFloat("low")).toBeGreaterThanOrEqual(0);
    expect(confidenceLevelToFloat("medium")).toBeLessThanOrEqual(1);
    expect(confidenceLevelToFloat("high")).toBeLessThanOrEqual(1);
  });

  it("orders low < medium < high", () => {
    expect(confidenceLevelToFloat("low")).toBeLessThan(confidenceLevelToFloat("medium"));
    expect(confidenceLevelToFloat("medium")).toBeLessThan(confidenceLevelToFloat("high"));
  });
});
