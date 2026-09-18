import { describe, expect, it } from "vitest";
import { validateNarrative } from "./validateNarrative";
import type { AnalysisResponse } from "../openai/responseSchema";

function response(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    matchPercent: 65,
    confidenceLevel: "medium",
    criterionAssessments: [],
    summary: "A concise summary.",
    strengths: [],
    gaps: [],
    experienceAssessment: "relevant",
    experienceAssessmentReason: "Some relevant project experience is present.",
    recommendation: "worth_contacting",
    recommendationReason: "Reasonable match.",
    contactRecommendation: "maybe",
    contactRecommendationReason: "Worth a short message to confirm details.",
    saveRecommendation: "consider_saving",
    saveRecommendationReason: "Keep for reference.",
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

  it("normalizes a summary over the 60-word hard cap rather than passing it through as-is", () => {
    const longSentence = "This is a padded sentence with plenty of words in it for testing purposes today.";
    const summary = Array(6).fill(longSentence).join(" "); // well over 60 words
    const validated = validateNarrative(response({ summary }), new Set());
    const wordCount = validated.summary!.trim().split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(60);
  });
});

describe("validateNarrative - strengths and gaps coexist", () => {
  it("keeps both strengths and gaps when the response legitimately has both", () => {
    const suppliedIds = new Set(["experience:0"]);
    const validated = validateNarrative(
      response({
        strengths: [{ title: "Direct FRC mentoring", explanation: "Mentors an active team.", evidenceIds: ["experience:0"] }],
        gaps: [{ title: "Python not confirmed", explanation: "No Python evidence found.", importance: "PREFERRED", evidenceIds: [] }],
      }),
      suppliedIds,
    );
    expect(validated.strengths).toHaveLength(1);
    expect(validated.gaps).toHaveLength(1);
  });

  it("never drops legitimate gaps just because the response is otherwise positive (a strong overall read must still surface real gaps)", () => {
    const suppliedIds = new Set(["experience:0"]);
    const validated = validateNarrative(
      response({
        recommendation: "strong_candidate",
        strengths: [{ title: "Strong direct match", explanation: "Confirmed FRC mentoring role.", evidenceIds: ["experience:0"] }],
        gaps: [{ title: "Sponsor presentation experience unconfirmed", explanation: "No evidence of presenting to sponsors.", importance: "PREFERRED", evidenceIds: [] }],
      }),
      suppliedIds,
    );
    expect(validated.gaps).toHaveLength(1);
    expect(validated.gaps[0]!.title).toBe("Sponsor presentation experience unconfirmed");
  });
});

describe("validateNarrative - confidenceLevel passthrough", () => {
  it("passes the AI's own confidenceLevel through unchanged", () => {
    expect(validateNarrative(response({ confidenceLevel: "low" }), new Set()).confidenceLevel).toBe("low");
    expect(validateNarrative(response({ confidenceLevel: "high" }), new Set()).confidenceLevel).toBe("high");
  });
});

describe("validateNarrative - new reason fields", () => {
  it("passes through and trims experienceAssessmentReason, recommendationReason, contactRecommendationReason, and saveRecommendationReason", () => {
    const validated = validateNarrative(
      response({
        experienceAssessmentReason: "  Direct project experience is present.  ",
        recommendationReason: "  Strong overall fit.  ",
        contactRecommendationReason: "  Worth a message.  ",
        saveRecommendationReason: "  Keep for later.  ",
      }),
      new Set(),
    );
    expect(validated.experienceAssessmentReason).toBe("Direct project experience is present.");
    expect(validated.recommendationReason).toBe("Strong overall fit.");
    expect(validated.contactRecommendationReason).toBe("Worth a message.");
    expect(validated.saveRecommendationReason).toBe("Keep for later.");
  });
});
