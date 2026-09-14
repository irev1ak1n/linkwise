import { describe, expect, it } from "vitest";
import { generateCriteriaRequestSchema, GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH } from "./generateCriteriaRequestSchema";

describe("generateCriteriaRequestSchema", () => {
  it("accepts a well-formed description", () => {
    expect(generateCriteriaRequestSchema.safeParse({ description: "FRC mentor in Charlotte" }).success).toBe(true);
  });

  it("rejects a missing description", () => {
    expect(generateCriteriaRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty description", () => {
    expect(generateCriteriaRequestSchema.safeParse({ description: "" }).success).toBe(false);
  });

  it("rejects a description over the max length", () => {
    const description = "x".repeat(GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH + 1);
    expect(generateCriteriaRequestSchema.safeParse({ description }).success).toBe(false);
  });

  it("accepts a description exactly at the max length", () => {
    const description = "x".repeat(GENERATE_CRITERIA_MAX_DESCRIPTION_LENGTH);
    expect(generateCriteriaRequestSchema.safeParse({ description }).success).toBe(true);
  });
});
