import { describe, expect, it } from "vitest";
import { createCriterion, createGoal, hasScoreableCriteria } from "./goal";

describe("hasScoreableCriteria", () => {
  it("is false for a goal with no criteria at all", () => {
    const goal = createGoal("Empty goal");
    expect(hasScoreableCriteria(goal)).toBe(false);
  });

  it("is false for a goal whose only criteria are EXCLUDED", () => {
    const goal = { ...createGoal("Excluded only"), criteria: [createCriterion("recruiter", "EXCLUDED")] };
    expect(hasScoreableCriteria(goal)).toBe(false);
  });

  it("is true when at least one non-EXCLUDED criterion exists alongside EXCLUDED ones", () => {
    const goal = {
      ...createGoal("Mixed"),
      criteria: [createCriterion("recruiter", "EXCLUDED"), createCriterion("Python", "MUST_HAVE")],
    };
    expect(hasScoreableCriteria(goal)).toBe(true);
  });

  it("is true for a normal goal with ordinary criteria", () => {
    const goal = { ...createGoal("Normal"), criteria: [createCriterion("Python", "PREFERRED")] };
    expect(hasScoreableCriteria(goal)).toBe(true);
  });
});
