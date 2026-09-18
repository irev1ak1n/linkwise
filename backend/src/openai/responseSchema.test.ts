import { describe, expect, it } from "vitest";
import { analysisResponseSchema } from "./responseSchema";

function validResponse() {
  return {
    matchPercent: 72,
    confidenceLevel: "medium",
    criterionAssessments: [{ criterionId: "c1", assessment: "strong", confidence: 0.9, evidenceIds: ["experience:0"], rationale: "x" }],
    summary: "Summary.",
    strengths: [{ title: "Strength", explanation: "x", evidenceIds: ["experience:0"] }],
    gaps: [],
    experienceAssessment: "relevant",
    experienceAssessmentReason: "x",
    recommendation: "worth_contacting",
    recommendationReason: "x",
    contactRecommendation: "maybe",
    contactRecommendationReason: "x",
    saveRecommendation: "consider_saving",
    saveRecommendationReason: "x",
  };
}

describe("analysisResponseSchema - valid response", () => {
  it("accepts a well-formed response", () => {
    expect(analysisResponseSchema.safeParse(validResponse()).success).toBe(true);
  });
});

describe("analysisResponseSchema - matchPercent must stay within 0-100", () => {
  it("rejects a score above 100", () => {
    const body = { ...validResponse(), matchPercent: 150 };
    expect(analysisResponseSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a negative score", () => {
    const body = { ...validResponse(), matchPercent: -5 };
    expect(analysisResponseSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a non-integer score", () => {
    const body = { ...validResponse(), matchPercent: 72.5 };
    expect(analysisResponseSchema.safeParse(body).success).toBe(false);
  });

  it("accepts the boundary values 0 and 100", () => {
    expect(analysisResponseSchema.safeParse({ ...validResponse(), matchPercent: 0 }).success).toBe(true);
    expect(analysisResponseSchema.safeParse({ ...validResponse(), matchPercent: 100 }).success).toBe(true);
  });
});

describe("analysisResponseSchema - confidenceLevel must be one of the three enum values", () => {
  it("rejects an unrecognized confidence level", () => {
    const body = { ...validResponse(), confidenceLevel: "very high" };
    expect(analysisResponseSchema.safeParse(body).success).toBe(false);
  });

  it("accepts low, medium, and high", () => {
    for (const level of ["low", "medium", "high"]) {
      expect(analysisResponseSchema.safeParse({ ...validResponse(), confidenceLevel: level }).success, level).toBe(true);
    }
  });
});

describe("analysisResponseSchema - missing required fields", () => {
  it("rejects a response missing matchPercent entirely", () => {
    const body = validResponse() as Partial<ReturnType<typeof validResponse>>;
    delete body.matchPercent;
    expect(analysisResponseSchema.safeParse(body).success).toBe(false);
  });

  it("accepts an empty criterionAssessments array — a goal with no parsed criteria still reasons holistically", () => {
    const body = { ...validResponse(), criterionAssessments: [] };
    expect(analysisResponseSchema.safeParse(body).success).toBe(true);
  });
});
