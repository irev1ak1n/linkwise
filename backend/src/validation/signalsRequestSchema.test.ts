import { describe, expect, it } from "vitest";
import { analyzeSignalsRequestSchema, trimSignalsRequest } from "./signalsRequestSchema";
import { MAX_TEXT_LENGTH } from "./requestSchema";

function validBody() {
  return {
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

  it("trims oversized evidence text", () => {
    const body = validBody();
    body.profile.evidence[0]!.text = "x".repeat(MAX_TEXT_LENGTH * 2);
    const trimmed = trimSignalsRequest(analyzeSignalsRequestSchema.parse(body));
    expect(trimmed.profile.evidence[0]!.text).toHaveLength(MAX_TEXT_LENGTH);
  });
});
