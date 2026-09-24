import { describe, expect, it } from "vitest";
import { computeAnalysisCacheKey } from "./analysisCacheKey";
import { buildAnalyzeProfileRequest } from "./buildAnalyzeRequest";
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

describe("computeAnalysisCacheKey", () => {
  it("is deterministic for the same goal and profile", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const p = profile({ skills: ["Python"] });
    const result = scoreProfileAgainstGoal(goal, p);
    const request = buildAnalyzeProfileRequest(goal, p, result);
    expect(computeAnalysisCacheKey(goal, request)).toBe(computeAnalysisCacheKey(goal, request));
  });

  it("changes when the profile's evidence changes (more of the profile has loaded)", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const before = profile({ headline: "Engineer" });
    const after = profile({ headline: "Engineer", skills: ["Python"] });

    const beforeRequest = buildAnalyzeProfileRequest(goal, before, scoreProfileAgainstGoal(goal, before));
    const afterRequest = buildAnalyzeProfileRequest(goal, after, scoreProfileAgainstGoal(goal, after));

    expect(computeAnalysisCacheKey(goal, beforeRequest)).not.toBe(computeAnalysisCacheKey(goal, afterRequest));
  });

  it("changes when the goal's criteria change", () => {
    const p = profile({ skills: ["Python"] });
    const goalA = { ...createGoal("A"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const goalB = { ...createGoal("B"), criteria: [createCriterion("Java", "MUST_HAVE")] };

    const requestA = buildAnalyzeProfileRequest(goalA, p, scoreProfileAgainstGoal(goalA, p));
    const requestB = buildAnalyzeProfileRequest(goalB, p, scoreProfileAgainstGoal(goalB, p));

    expect(computeAnalysisCacheKey(goalA, requestA)).not.toBe(computeAnalysisCacheKey(goalB, requestB));
  });

  it("changes for a different profile identity even with identical evidence/goal", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("Python", "MUST_HAVE")] };
    const alice = profile({ name: "Alice", skills: ["Python"] });
    const bob = profile({ name: "Bob", skills: ["Python"] });

    const aliceRequest = buildAnalyzeProfileRequest(goal, alice, scoreProfileAgainstGoal(goal, alice));
    const bobRequest = buildAnalyzeProfileRequest(goal, bob, scoreProfileAgainstGoal(goal, bob));

    expect(computeAnalysisCacheKey(goal, aliceRequest)).not.toBe(computeAnalysisCacheKey(goal, bobRequest));
  });
});
