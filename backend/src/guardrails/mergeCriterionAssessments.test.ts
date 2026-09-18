import { describe, expect, it } from "vitest";
import { mergeCriterionAssessments } from "./mergeCriterionAssessments";
import { analyzeProfileRequestSchema, type AnalyzeProfileRequest } from "../validation/requestSchema";
import type { AnalysisResponse, CriterionAssessmentResponse } from "../openai/responseSchema";

function request(overrides: Partial<AnalyzeProfileRequest> = {}): AnalyzeProfileRequest {
  return analyzeProfileRequestSchema.parse({
    goal: {
      id: "goal_1",
      description: "Looking for an FRC mentor",
      criteria: [{ id: "c1", label: "FRC mentor", importance: "MUST_HAVE" }],
    },
    profile: {
      identity: "Jordan Rivera",
      evidence: [{ id: "experience:0", section: "experience", text: "Mentored a robotics team for 3 years.", evidenceType: "experience" }],
    },
    localAnalysis: {
      score: null,
      confidence: 0,
      profileExtracted: true,
      criterionResults: [{ criterionId: "c1", strength: "missing", evidenceIds: [] }],
    },
    ...overrides,
  });
}

function aiAssessment(overrides: Partial<CriterionAssessmentResponse> = {}): CriterionAssessmentResponse {
  return { criterionId: "c1", assessment: "strong", confidence: 0.9, evidenceIds: ["experience:0"], rationale: "Directly mentored a robotics team.", ...overrides };
}

function aiResponse(assessments: CriterionAssessmentResponse[]): AnalysisResponse {
  return {
    matchPercent: 60,
    confidenceLevel: "medium",
    criterionAssessments: assessments,
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
  };
}

describe("mergeCriterionAssessments - AI semantic improvement over exact keywords", () => {
  it("upgrades a locally-missing criterion when AI cites real, supplied evidence", () => {
    const req = request();
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment()]));
    const merged = assessments.get("c1")!;
    expect(merged.strength).toBe("strong");
    expect(merged.evidence).toBeDefined();
    expect(merged.evidence!.snippet).toContain("Mentored a robotics team");
  });
});

describe("mergeCriterionAssessments - unsupported claims are rejected", () => {
  it("falls back to local when AI claims strong with zero supplied evidence IDs", () => {
    const req = request();
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment({ evidenceIds: [] })]));
    expect(assessments.get("c1")!.strength).toBe("missing"); // local floor, not AI's unsupported "strong"
  });

  it("falls back to local when AI cites an evidence ID that was never supplied in the request", () => {
    const req = request();
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment({ evidenceIds: ["experience:99"] })]));
    expect(assessments.get("c1")!.strength).toBe("missing");
  });
});

describe("mergeCriterionAssessments - Unknown vs Missing", () => {
  it("keeps local's unknown authoritative, ignoring any AI opinion", () => {
    const req = request({
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "c1", strength: "unknown", evidenceIds: [] }] },
    });
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment({ assessment: "strong" })]));
    expect(assessments.get("c1")!.strength).toBe("unknown");
  });

  it("never lets AI regress a resolved local result down to unknown", () => {
    const req = request();
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment({ assessment: "unknown", evidenceIds: [] })]));
    expect(assessments.get("c1")!.strength).toBe("missing"); // local's resolved "missing", not AI's regressive "unknown"
  });
});

describe("mergeCriterionAssessments - Excluded criterion guardrail", () => {
  it("never lets AI undo a confirmed local exclusion", () => {
    const req = request({
      goal: { id: "g1", description: "Test", criteria: [{ id: "c1", label: "recruiter", importance: "EXCLUDED" }] },
      localAnalysis: {
        score: 0,
        confidence: 1,
        profileExtracted: true,
        criterionResults: [{ criterionId: "c1", strength: "strong", evidenceIds: ["experience:0"] }],
      },
    });
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment({ assessment: "missing", evidenceIds: [] })]));
    expect(assessments.get("c1")!.strength).toBe("strong");
  });

  it("lets AI find a NEW confirmed exclusion the local pass didn't catch, when grounded", () => {
    const req = request({
      goal: { id: "g1", description: "Test", criteria: [{ id: "c1", label: "recruiter", importance: "EXCLUDED" }] },
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "c1", strength: "missing", evidenceIds: [] }] },
    });
    const { assessments } = mergeCriterionAssessments(req, aiResponse([aiAssessment({ assessment: "strong" })]));
    expect(assessments.get("c1")!.strength).toBe("strong");
    expect(assessments.get("c1")!.evidence).toBeDefined();
  });
});

describe("mergeCriterionAssessments - AI silent on a criterion", () => {
  it("falls back to local when AI's response has no entry for a criterion", () => {
    const req = request();
    const { assessments } = mergeCriterionAssessments(req, aiResponse([]));
    expect(assessments.get("c1")!.strength).toBe("missing");
  });
});

describe("mergeCriterionAssessments - degenerate local evidence", () => {
  it("downgrades a local positive claim with no resolvable evidence id to weak rather than producing an evidence-less positive claim", () => {
    const req = request({
      localAnalysis: { score: 80, confidence: 1, profileExtracted: true, criterionResults: [{ criterionId: "c1", strength: "strong", evidenceIds: [] }] },
    });
    const { assessments } = mergeCriterionAssessments(req, aiResponse([]));
    expect(assessments.get("c1")!.strength).toBe("weak");
  });
});

describe("mergeCriterionAssessments - aiInformedCriterionIds tracking", () => {
  it("records which criteria actually used a grounded AI assessment", () => {
    const req = request();
    const { aiInformedCriterionIds } = mergeCriterionAssessments(req, aiResponse([aiAssessment()]));
    expect(aiInformedCriterionIds.has("c1")).toBe(true);
  });

  it("does not record a criterion that fell back to local", () => {
    const req = request();
    const { aiInformedCriterionIds } = mergeCriterionAssessments(req, aiResponse([]));
    expect(aiInformedCriterionIds.has("c1")).toBe(false);
  });
});
