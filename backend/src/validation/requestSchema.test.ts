import { describe, expect, it } from "vitest";
import { analyzeProfileRequestSchema, MAX_TEXT_LENGTH, trimOversizedText, type EvidenceSection, type CriterionCategoryValue } from "./requestSchema";

interface EvidenceItemFixture {
  id: string;
  section: EvidenceSection;
  text: string;
  evidenceType: string;
}

interface CriterionFixture {
  id: string;
  label: string;
  importance: "MUST_HAVE" | "PREFERRED" | "OPTIONAL" | "EXCLUDED";
  category?: CriterionCategoryValue;
}

function validBody() {
  return {
    goal: {
      id: "goal_1",
      description: "Looking for FRC mentors",
      criteria: [{ id: "c1", label: "FRC mentor", importance: "MUST_HAVE", category: "role" }] as CriterionFixture[],
    },
    profile: {
      identity: "Jordan Rivera",
      headline: "Software Engineer",
      location: "Charlotte, NC",
      evidence: [
        { id: "headline:0", section: "headline", text: "Software Engineer", evidenceType: "headline" },
      ] as EvidenceItemFixture[],
    },
    localAnalysis: {
      score: 50,
      confidence: 0.8,
      profileExtracted: true,
      criterionResults: [{ criterionId: "c1", strength: "missing" as const, evidenceIds: [] }],
    },
  };
}

describe("analyzeProfileRequestSchema - AI-generated criterion categories", () => {
  it("accepts every category value AI criteria generation can produce, not just the original 5 (regression: a goal built from AI-generated criteria — e.g. category \"membership\" or \"language\" — was live-observed getting rejected as invalid_request, silently forcing every analysis for that goal to fall back to local)", () => {
    const aiCategories = [
      "organization",
      "membership",
      "skill",
      "education",
      "language",
      "leadership",
      "mentoring",
      "competition",
      "service",
      "project",
      "industry",
      "interest",
    ] as const;
    for (const category of aiCategories) {
      const body = validBody();
      body.goal.criteria[0]!.category = category;
      expect(analyzeProfileRequestSchema.safeParse(body).success, `category "${category}" should be accepted`).toBe(true);
    }
  });
});

describe("analyzeProfileRequestSchema - valid input", () => {
  it("accepts a well-formed request body", () => {
    const result = analyzeProfileRequestSchema.safeParse(validBody());
    expect(result.success).toBe(true);
  });
});

describe("analyzeProfileRequestSchema - malformed input", () => {
  it("rejects a request missing the goal entirely", () => {
    const body = validBody();
    // @ts-expect-error deliberately malformed for the test
    delete body.goal;
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it("accepts a goal with zero criteria when a free-text description is present — AI-first analysis reasons directly from the goal's own text", () => {
    const body = validBody();
    body.goal.criteria = [];
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(true);
  });

  it("rejects a goal with zero criteria AND an empty description — nothing to reason about at all", () => {
    const body = validBody();
    body.goal.criteria = [];
    body.goal.description = "";
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects an unrecognized criterion importance", () => {
    const body = validBody();
    // @ts-expect-error deliberately invalid enum value
    body.goal.criteria[0]!.importance = "SOMETHING_ELSE";
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects an unrecognized evidence section", () => {
    const body = validBody();
    // @ts-expect-error deliberately invalid enum value
    body.profile.evidence[0]!.section = "cookies";
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a confidence value outside [0, 1]", () => {
    const body = validBody();
    body.localAnalysis.confidence = 1.5;
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(false);
  });

  it("rejects more evidence items than the cap allows", () => {
    const body = validBody();
    body.profile.evidence = Array.from({ length: 201 }, (_, i) => ({
      id: `skills:${i}`,
      section: "skills" as const,
      text: "Python",
      evidenceType: "skills",
    }));
    expect(analyzeProfileRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe("trimOversizedText", () => {
  it("trims an oversized evidence text field down to the max length rather than rejecting it", () => {
    const body = validBody();
    body.profile.evidence[0]!.text = "x".repeat(MAX_TEXT_LENGTH * 3);
    const parsed = analyzeProfileRequestSchema.parse(body);
    const trimmed = trimOversizedText(parsed);
    expect(trimmed.profile.evidence[0]!.text.length).toBe(MAX_TEXT_LENGTH);
  });

  it("leaves normally-sized fields untouched", () => {
    const parsed = analyzeProfileRequestSchema.parse(validBody());
    const trimmed = trimOversizedText(parsed);
    expect(trimmed.profile.evidence[0]!.text).toBe("Software Engineer");
  });
});
