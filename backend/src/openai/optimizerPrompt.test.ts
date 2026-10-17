import { describe, expect, it } from "vitest";
import { OPTIMIZER_SYSTEM_PROMPT } from "./optimizerPrompt";
import { optimizerResponseSchema } from "./optimizerSchema";
import { SYSTEM_PROMPT } from "./prompt";

describe("optimizer summary prompt", () => {
  it("asks for an evaluation of the profile itself, opening with an overall claim", () => {
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("judges how well the LinkedIn profile itself is built, not what the person has accomplished");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Four or five sentences, about 75 to 120 words");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Sentence 1 is an overall claim");
    expect(OPTIMIZER_SYSTEM_PROMPT).toMatch(/completeness, organization, clarity, specificity, writing quality, professional positioning/);
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("never restate it");
  });

  it("has the summary written after, and from, the section assessments", () => {
    expect(Object.keys(optimizerResponseSchema.shape)).toEqual(["assessments", "summary"]);
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("written after the assessments and built from them");
  });

  it("leaves the Profile Analyzer summary about the person", () => {
    expect(SYSTEM_PROMPT).not.toContain("how well the LinkedIn profile itself is built");
  });
});
