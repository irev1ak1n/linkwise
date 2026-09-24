import { describe, expect, it } from "vitest";
import { buildAnalyzeProfileRequest, buildLocalCriterionResults } from "./buildAnalyzeRequest";
import { buildEvidencePayload } from "./evidencePayload";
import { scoreProfileAgainstGoal } from "../matching/scoreProfile";
import { createCriterion, createGoal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";

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
    honors: [],
    extracted: true,
    ...overrides,
  };
}

describe("buildAnalyzeProfileRequest", () => {
  it("never includes raw HTML or anything beyond normalized evidence — only what profileTextFields exposes", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("software engineer", "MUST_HAVE")] };
    const p = profile({ headline: "Senior Software Engineer", about: "I build things." });
    const result = scoreProfileAgainstGoal(goal, p);
    const request = buildAnalyzeProfileRequest(goal, p, result);

    expect(request.profile.evidence.every((e) => typeof e.text === "string")).toBe(true);
    expect(JSON.stringify(request)).not.toContain("<html");
  });

  it("carries the goal's criteria with id, label, importance, and category", () => {
    const goal = { ...createGoal("FRC mentor"), criteria: [createCriterion("FRC mentor", "MUST_HAVE", { category: "role" })] };
    const p = profile({ headline: "FRC Mentor" });
    const result = scoreProfileAgainstGoal(goal, p);
    const request = buildAnalyzeProfileRequest(goal, p, result);

    expect(request.goal.criteria[0]).toMatchObject({
      id: goal.criteria[0].id,
      label: "FRC mentor",
      importance: "MUST_HAVE",
      category: "role",
    });
  });

  it("gives every criterion a local strength — including EXCLUDED ones, which computeMatchResult itself discards once not disqualifying", () => {
    const goal = {
      ...createGoal("Test"),
      criteria: [createCriterion("machine learning", "PREFERRED"), createCriterion("recruiter", "EXCLUDED")],
    };
    const p = profile({ about: "I work in machine learning." });
    const result = scoreProfileAgainstGoal(goal, p);
    // Confirm the excluded criterion is absent from the final MatchResult's arrays, exactly
    // the discarded information buildLocalCriterionResults must recover.
    expect(result.reasons.some((r) => r.criterion.label === "recruiter")).toBe(false);
    expect(result.missing.some((m) => m.criterion.label === "recruiter")).toBe(false);

    const request = buildAnalyzeProfileRequest(goal, p, result);
    const excludedResult = request.localAnalysis.criterionResults.find((r) => r.criterionId === goal.criteria[1].id);
    expect(excludedResult).toBeDefined();
    expect(excludedResult!.strength).toBe("missing"); // genuinely evaluated, not a placeholder "unknown"
  });

  it("attaches a valid evidence ID to a criterion result whenever real evidence backs it", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("software engineer", "MUST_HAVE")] };
    const p = profile({ experience: [{ title: "Software Engineer", company: "Acme Corp" }] });
    const result = scoreProfileAgainstGoal(goal, p);
    const request = buildAnalyzeProfileRequest(goal, p, result);

    const criterionResult = request.localAnalysis.criterionResults[0];
    expect(criterionResult.strength).toBe("strong");
    expect(criterionResult.evidenceIds.length).toBeGreaterThan(0);
    const referencedId = criterionResult.evidenceIds[0];
    expect(request.profile.evidence.some((e) => e.id === referencedId)).toBe(true);
  });

  it("echoes the same overall score/confidence/profileExtracted the local engine computed", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);
    const request = buildAnalyzeProfileRequest(goal, p, result);
    expect(request.localAnalysis.score).toBe(result.scorePercent);
    expect(request.localAnalysis.confidence).toBe(result.confidence);
    expect(request.localAnalysis.profileExtracted).toBe(result.profileExtracted);
  });
});

describe("buildLocalCriterionResults", () => {
  it("is deterministic across repeated calls with the same inputs", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const evidence = buildEvidencePayload(p);
    expect(buildLocalCriterionResults(goal, p, evidence)).toEqual(buildLocalCriterionResults(goal, p, evidence));
  });
});
