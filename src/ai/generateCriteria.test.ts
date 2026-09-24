import { describe, expect, it, vi } from "vitest";
import { generateCriteria } from "./generateCriteria";
import type { GenerateCriteriaOutcome } from "./apiTypes";
import type { PendingGenerateCriteriaRequest } from "./generateCriteriaClient";

function fakeRequest(outcome: GenerateCriteriaOutcome): typeof import("./generateCriteriaClient").requestGenerateCriteria {
  return () => ({ requestId: "r1", promise: Promise.resolve(outcome), cancel: vi.fn() }) satisfies PendingGenerateCriteriaRequest;
}

describe("generateCriteria - AI success", () => {
  it("uses the AI-generated criteria, mapping `type` to `category`", async () => {
    const requestGenerateCriteria = fakeRequest({
      status: "ok",
      name: "TSA Members",
      criteria: [
        { label: "Current Technology Student Association member", type: "membership", importance: "PREFERRED", operator: null, value: null, groupId: null, sourceText: "Technology Student Association Current member" },
        { label: "10+ service hours", type: "service", importance: "PREFERRED", operator: "at_least", value: "10", groupId: null, sourceText: "10+ service hours" },
      ],
    });

    const result = await generateCriteria("Technology Student Association Current member, 10+ service hours", { requestGenerateCriteria });
    expect(result.source).toBe("ai");
    expect(result.name).toBe("TSA Members");
    expect(result.criteria).toHaveLength(2);
    expect(result.criteria[0]).toMatchObject({ label: "Current Technology Student Association member", category: "membership" });
    expect(result.criteria[1]).toMatchObject({ label: "10+ service hours", category: "service", operator: "at_least", value: "10" });
  });
});

describe("generateCriteria - falls back to the local parser", () => {
  it("falls back when the AI reports unavailable", async () => {
    const requestGenerateCriteria = fakeRequest({ status: "unavailable", reason: "not_configured" });
    const result = await generateCriteria("I am looking for FRC mentors in Charlotte", { requestGenerateCriteria });
    expect(result.source).toBe("local");
    expect(result.criteria.length).toBeGreaterThan(0);
  });

  it("falls back when the AI succeeds but returns zero criteria", async () => {
    const requestGenerateCriteria = fakeRequest({ status: "ok", name: "", criteria: [] });
    const result = await generateCriteria("I am looking for FRC mentors in Charlotte", { requestGenerateCriteria });
    expect(result.source).toBe("local");
    expect(result.criteria.length).toBeGreaterThan(0);
  });

  it("returns an empty result (never throws) when both AI and the local parser find nothing", async () => {
    const requestGenerateCriteria = fakeRequest({ status: "unavailable", reason: "openai_error" });
    const result = await generateCriteria("asdf", { requestGenerateCriteria });
    expect(result.source).toBe("local");
    expect(result.criteria).toEqual([]);
  });

  it("gives a short readable fallback name when AI is unavailable, never the raw sentence", async () => {
    const requestGenerateCriteria = fakeRequest({ status: "unavailable", reason: "not_configured" });
    const result = await generateCriteria("Software/computer science skills, being able to create projects", { requestGenerateCriteria });
    expect(result.name).not.toContain("...");
    expect(result.name.length).toBeLessThan(60);
  });
});
