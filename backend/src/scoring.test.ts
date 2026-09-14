import { describe, expect, it } from "vitest";
import { computeFinalScore } from "./scoring";
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
    evidenceConfidence: 0.5,
    ...overrides,
  };
}

describe("computeFinalScore - Must Have guardrail", () => {
  it("keeps a Strong Match (70+) out of reach when a Must Have is missing, even if AI is enthusiastic elsewhere", () => {
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
    const merge = mergeCriterionAssessments(req, aiResponse());
    const result = computeFinalScore(req, merge);
    expect(result.scorePercent).toBeLessThan(70);
    expect(result.complete).toBe(false);
  });
});

describe("computeFinalScore - Excluded criterion guardrail", () => {
  it("disqualifies the match when the merged assessment confirms a strong exclusion", () => {
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
    const merge = mergeCriterionAssessments(req, aiResponse());
    const result = computeFinalScore(req, merge);
    expect(result.disqualified).toBe(true);
    expect(result.scorePercent).toBe(0);
  });
});

describe("computeFinalScore - Unknown excluded from scoring", () => {
  it("produces a null score when the only criterion resolves to unknown", () => {
    const req = request();
    const merge = mergeCriterionAssessments(req, aiResponse());
    const result = computeFinalScore(req, merge);
    // local floor was "missing" (not unknown) in the default request fixture, so re-derive with
    // an explicitly unknown local floor to test this specific guardrail in isolation.
    const unknownReq = request({
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "c1", strength: "unknown", evidenceIds: [] }] },
    });
    const unknownMerge = mergeCriterionAssessments(unknownReq, aiResponse());
    const unknownResult = computeFinalScore(unknownReq, unknownMerge);
    expect(unknownResult.scorePercent).toBeNull();
    expect(result.scorePercent).not.toBeNull(); // sanity: the non-unknown case DOES resolve to a real (0%) score
  });
});
