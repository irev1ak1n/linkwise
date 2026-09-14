import { describe, expect, it } from "vitest";
import { sanitizeGeneratedCriteria } from "./sanitizeGeneratedCriteria";
import type { GeneratedCriterion, GenerateCriteriaResponse } from "../openai/criteriaSchema";

function criterion(overrides: Partial<GeneratedCriterion> = {}): GeneratedCriterion {
  return {
    label: "Python",
    type: "skill",
    importance: "PREFERRED",
    operator: null,
    value: null,
    groupId: null,
    sourceText: "Python",
    ...overrides,
  };
}

describe("sanitizeGeneratedCriteria", () => {
  it("drops a criterion whose label is empty after trimming", () => {
    const response: GenerateCriteriaResponse = { name: "Search", criteria: [criterion({ label: "   " })] };
    expect(sanitizeGeneratedCriteria(response).criteria).toHaveLength(0);
  });

  it("trims oversized label/sourceText/name fields rather than rejecting them", () => {
    const long = "x".repeat(500);
    const response: GenerateCriteriaResponse = { name: long, criteria: [criterion({ label: long, sourceText: long })] };
    const result = sanitizeGeneratedCriteria(response);
    expect(result.name.length).toBeLessThan(500);
    expect(result.criteria[0]!.label.length).toBeLessThan(500);
    expect(result.criteria[0]!.sourceText.length).toBeLessThan(500);
  });

  it("caps the number of criteria", () => {
    const many = Array.from({ length: 50 }, (_, i) => criterion({ label: `Criterion ${i}` }));
    const response: GenerateCriteriaResponse = { name: "Search", criteria: many };
    expect(sanitizeGeneratedCriteria(response).criteria.length).toBeLessThanOrEqual(30);
  });

  it("nulls out an operator with no paired value", () => {
    const response: GenerateCriteriaResponse = { name: "Search", criteria: [criterion({ operator: "at_least", value: null })] };
    const result = sanitizeGeneratedCriteria(response).criteria[0]!;
    expect(result.operator).toBeNull();
    expect(result.value).toBeNull();
  });

  it("nulls out a value with no paired operator", () => {
    const response: GenerateCriteriaResponse = { name: "Search", criteria: [criterion({ operator: null, value: "10" })] };
    const result = sanitizeGeneratedCriteria(response).criteria[0]!;
    expect(result.operator).toBeNull();
    expect(result.value).toBeNull();
  });

  it("keeps operator/value together when both are present", () => {
    const response: GenerateCriteriaResponse = { name: "Search", criteria: [criterion({ operator: "at_least", value: "10" })] };
    const result = sanitizeGeneratedCriteria(response).criteria[0]!;
    expect(result.operator).toBe("at_least");
    expect(result.value).toBe("10");
  });

  it("clears a groupId used by only one criterion (not a real alternative group)", () => {
    const response: GenerateCriteriaResponse = { name: "Search", criteria: [criterion({ groupId: "group_1" })] };
    expect(sanitizeGeneratedCriteria(response).criteria[0]!.groupId).toBeNull();
  });

  it("keeps a groupId shared by two or more criteria", () => {
    const response: GenerateCriteriaResponse = {
      name: "Search",
      criteria: [criterion({ label: "React", groupId: "group_1" }), criterion({ label: "Vue", groupId: "group_1" })],
    };
    const result = sanitizeGeneratedCriteria(response);
    expect(result.criteria[0]!.groupId).toBe("group_1");
    expect(result.criteria[1]!.groupId).toBe("group_1");
  });

  it("treats the literal string \"null\" as no group, even when three unrelated criteria all carry it (observed live: the model emitted the string \"null\" instead of a real null for groupId, which would otherwise wrongly turn three independent AND-combined criteria into one 3-way OR alternative)", () => {
    const response: GenerateCriteriaResponse = {
      name: "Search",
      criteria: [
        criterion({ label: "Current TSA member", groupId: "null" }),
        criterion({ label: "Multilingual", groupId: "null" }),
        criterion({ label: "10+ service hours", groupId: "null" }),
      ],
    };
    const result = sanitizeGeneratedCriteria(response);
    expect(result.criteria.map((c) => c.groupId)).toEqual([null, null, null]);
  });

  it("treats the literal string \"null\" as no value, not a paired quantity", () => {
    const response: GenerateCriteriaResponse = { name: "Search", criteria: [criterion({ operator: "at_least", value: "null" })] };
    const result = sanitizeGeneratedCriteria(response).criteria[0]!;
    expect(result.operator).toBeNull();
    expect(result.value).toBeNull();
  });
});
