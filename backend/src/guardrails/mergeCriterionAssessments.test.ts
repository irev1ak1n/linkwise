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

describe("mergeCriterionAssessments - the same person after a details page adds evidence", () => {
  // Main page: languages and a TSA mention. A Honors page then adds two unrelated awards.
  const evidence = [
    { id: "languages:0", section: "languages", text: "Spanish — Full professional proficiency", evidenceType: "languages" },
    { id: "education:0", section: "education", text: "Northfield High — Activities: Technology Student Association", evidenceType: "education" },
    { id: "honors:0", section: "honors", text: "Brain Bee Champion — Northfield Neuroscience Society", evidenceType: "honors" },
    { id: "honors:1", section: "honors", text: "Yale Book Award", evidenceType: "honors" },
  ];
  const criteria = [
    { id: "lang", label: "Speaks multiple languages", importance: "PREFERRED" },
    { id: "tsa", label: "TSA member", importance: "PREFERRED" },
  ];
  const sameSession = (ai: CriterionAssessmentResponse[], previousTsa: "weak" | "moderate" = "weak") => {
    const req = request({
      goal: { id: "g", description: "Multilingual TSA members", criteria },
      profile: { identity: "Jordan Rivera", evidence, coverage: "full" },
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: criteria.map((c) => ({ criterionId: c.id, strength: "missing", evidenceIds: [] })) },
      previous: {
        matchPercent: 56,
        assessments: [
          { criterionId: "lang", strength: "strong", evidenceSection: "languages", evidenceText: "Spanish — Full professional proficiency" },
          { criterionId: "tsa", strength: previousTsa, evidenceSection: "education", evidenceText: "Technology Student Association" },
        ],
        newEvidenceIds: ["honors:0", "honors:1"],
      },
    } as Partial<AnalyzeProfileRequest>);
    return mergeCriterionAssessments(req, aiResponse(ai)).assessments;
  };

  it("never weakens a criterion that the added section does not mention", () => {
    const assessments = sameSession([
      aiAssessment({ criterionId: "lang", assessment: "strong", evidenceIds: ["languages:0"] }),
      aiAssessment({ criterionId: "tsa", assessment: "missing", evidenceIds: [], rationale: "No TSA in the awards." }),
    ]);
    expect(assessments.get("tsa")!.strength).toBe("weak");
    expect(assessments.get("lang")!.strength).toBe("strong");
  });

  it("never re-reads old evidence into a different strength", () => {
    const assessments = sameSession([aiAssessment({ criterionId: "lang", assessment: "moderate", evidenceIds: ["languages:0"] }), aiAssessment({ criterionId: "tsa", assessment: "weak", evidenceIds: ["education:0"] })]);
    expect(assessments.get("lang")!.strength).toBe("strong");
    expect(assessments.get("lang")!.evidence!.snippet).toContain("Spanish");
  });

  it("lets new evidence change a criterion, up or down, when it is cited", () => {
    const up = sameSession([aiAssessment({ criterionId: "tsa", assessment: "strong", evidenceIds: ["honors:0"], rationale: "The new award is a TSA award." })]);
    expect(up.get("tsa")!.strength).toBe("strong");
    const down = sameSession([aiAssessment({ criterionId: "tsa", assessment: "weak", evidenceIds: ["honors:1"], rationale: "The award shows TSA membership ended." })], "moderate");
    expect(down.get("tsa")!.strength).toBe("weak");
  });

  it("drops an earlier strong assessment whose evidence is no longer on the profile", () => {
    const req = request({
      goal: { id: "g", description: "Multilingual", criteria: [criteria[0]!] },
      profile: { identity: "Jordan Rivera", evidence: [evidence[2]!], coverage: "full" },
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "lang", strength: "missing", evidenceIds: [] }] },
      previous: { matchPercent: 60, assessments: [{ criterionId: "lang", strength: "strong", evidenceSection: "languages", evidenceText: "Spanish — Full professional proficiency" }], newEvidenceIds: [] },
    } as Partial<AnalyzeProfileRequest>);
    expect(mergeCriterionAssessments(req, aiResponse([])).assessments.get("lang")!.strength).toBe("missing");
  });

  it("reads absence as unknown when only details pages were read", () => {
    const req = request({
      goal: { id: "g", description: "Multilingual", criteria: [criteria[0]!] },
      profile: { identity: "unknown", evidence: [evidence[2]!], coverage: "section" },
      localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [{ criterionId: "lang", strength: "missing", evidenceIds: [] }] },
    } as Partial<AnalyzeProfileRequest>);
    expect(mergeCriterionAssessments(req, aiResponse([aiAssessment({ criterionId: "lang", assessment: "missing", evidenceIds: [] })])).assessments.get("lang")!.strength).toBe("unknown");
  });
});
