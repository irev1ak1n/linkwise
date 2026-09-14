import { describe, expect, it } from "vitest";
import { validateNarrative } from "./validateNarrative";
import type { AnalysisResponse } from "../openai/responseSchema";

function response(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    criterionAssessments: [],
    summary: "A concise summary.",
    strengths: [],
    gaps: [],
    experienceAssessment: "relevant",
    recommendation: "worth_contacting",
    recommendationReason: "Reasonable match.",
    contactRecommendation: "maybe",
    saveRecommendation: "consider_saving",
    evidenceConfidence: 0.7,
    ...overrides,
  };
}

describe("validateNarrative - strengths must be grounded", () => {
  it("keeps a strength that cites at least one valid evidence ID", () => {
    const suppliedIds = new Set(["experience:0"]);
    const validated = validateNarrative(
      response({ strengths: [{ title: "Strong FRC mentor", explanation: "Mentored students.", evidenceIds: ["experience:0"] }] }),
      suppliedIds,
    );
    expect(validated.strengths).toHaveLength(1);
  });

  it("drops a strength whose only cited evidence ID was never supplied", () => {
    const suppliedIds = new Set(["experience:0"]);
    const validated = validateNarrative(
      response({ strengths: [{ title: "Experienced FRC mentor", explanation: "...", evidenceIds: ["experience:99"] }] }),
      suppliedIds,
    );
    expect(validated.strengths).toHaveLength(0);
  });

  it("drops a strength with no evidence IDs at all — an unsupported positive claim", () => {
    const validated = validateNarrative(response({ strengths: [{ title: "Great fit", explanation: "...", evidenceIds: [] }] }), new Set());
    expect(validated.strengths).toHaveLength(0);
  });

  it("strips invalid IDs from a strength's evidence list while keeping the ones that are valid", () => {
    const suppliedIds = new Set(["experience:0"]);
    const validated = validateNarrative(
      response({ strengths: [{ title: "Strong match", explanation: "...", evidenceIds: ["experience:0", "experience:99"] }] }),
      suppliedIds,
    );
    expect(validated.strengths[0]!.evidenceIds).toEqual(["experience:0"]);
  });
});

describe("validateNarrative - gaps may legitimately cite no evidence", () => {
  it("keeps a gap with an empty evidence list — describing an absence needs no positive citation", () => {
    const validated = validateNarrative(
      response({ gaps: [{ title: "No mentoring experience found", explanation: "...", importance: "MUST_HAVE", evidenceIds: [] }] }),
      new Set(),
    );
    expect(validated.gaps).toHaveLength(1);
  });

  it("still strips an invalid evidence ID from a gap rather than trusting it", () => {
    const validated = validateNarrative(
      response({ gaps: [{ title: "Gap", explanation: "...", importance: "PREFERRED", evidenceIds: ["not-real:0"] }] }),
      new Set(),
    );
    expect(validated.gaps[0]!.evidenceIds).toEqual([]);
  });
});

describe("validateNarrative - summary", () => {
  it("passes through a non-empty summary", () => {
    expect(validateNarrative(response({ summary: "Real summary." }), new Set()).summary).toBe("Real summary.");
  });

  it("reports undefined for an empty/whitespace summary so callers fall back to the local template", () => {
    expect(validateNarrative(response({ summary: "   " }), new Set()).summary).toBeUndefined();
  });
});
