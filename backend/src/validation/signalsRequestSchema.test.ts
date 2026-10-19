import { describe, expect, it } from "vitest";
import { analyzeSignalsRequestSchema, trimSignalsRequest } from "./signalsRequestSchema";
import { MAX_TEXT_LENGTH } from "./requestSchema";

function validBody() {
  return {
    version: 3 as const,
    goal: null as { text: string } | null,
    profile: {
      identity: "jordan-rivera",
      evidence: [{ id: "experience:0", section: "experience", text: "Led a 5-student team", evidenceType: "experience" }],
    },
  };
}

describe("analyzeSignalsRequestSchema", () => {
  it("accepts structured evidence", () => {
    expect(analyzeSignalsRequestSchema.safeParse(validBody()).success).toBe(true);
  });

  it("rejects an empty evidence list", () => {
    const body = validBody();
    body.profile.evidence = [];
    expect(analyzeSignalsRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects an unknown section", () => {
    const body = validBody();
    body.profile.evidence[0]!.section = "interests";
    expect(analyzeSignalsRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a missing identity", () => {
    const body = validBody() as { profile: { identity?: string } };
    delete body.profile.identity;
    expect(analyzeSignalsRequestSchema.safeParse(body).success).toBe(false);
  });

  it("requires contract version 2", () => {
    expect(analyzeSignalsRequestSchema.safeParse({ ...validBody(), version: 1 }).success).toBe(false);
  });

  it("accepts a goal and short context for the other profile items", () => {
    const body = { ...validBody(), goal: { text: "Student developers" } };
    const withContext = { ...body, profile: { ...body.profile, context: [{ section: "education", text: "AP Computer Science" }] } };
    expect(analyzeSignalsRequestSchema.safeParse(withContext).success).toBe(true);
  });

  it("trims oversized evidence text", () => {
    const body = validBody();
    body.profile.evidence[0]!.text = "x".repeat(MAX_TEXT_LENGTH * 2);
    const trimmed = trimSignalsRequest(analyzeSignalsRequestSchema.parse(body));
    expect(trimmed.profile.evidence[0]!.text).toHaveLength(MAX_TEXT_LENGTH);
  });
});
