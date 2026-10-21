import { describe, expect, it } from "vitest";
import { OPTIMIZER_SYSTEM_PROMPT } from "./optimizerPrompt";
import { optimizerResponseSchema } from "./optimizerSchema";
import { SYSTEM_PROMPT } from "./prompt";
import { ABOUT_GENERATION_PROMPT, HEADLINE_GENERATION_PROMPT } from "./sectionPrompt";

describe("optimizer summary prompt", () => {
  it("asks for a short, plain, specific summary built from the assessments", () => {
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Four to six complete sentences, 80 to 100 words");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Name the actual section and the actual problem");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Never call a present section missing, never call a \"strong\" section weak");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("No semicolons");
    expect(OPTIMIZER_SYSTEM_PROMPT).not.toContain("Never name a section");
  });

  it("treats section notes as the user's own word and says where to surface them", () => {
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain('"[Skills] ..."');
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("SURFACING USER CONTEXT");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Never say the profile shows it");
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("Honors & Awards");
  });

  it("has the summary written after, and from, the section assessments", () => {
    expect(Object.keys(optimizerResponseSchema.shape)).toEqual(["assessments", "summary"]);
    expect(OPTIMIZER_SYSTEM_PROMPT).toContain("written after the assessments and built from them");
  });

  it("leaves the Profile Analyzer summary about the person", () => {
    expect(SYSTEM_PROMPT).not.toContain("like a smart friend explaining the profile");
  });
});

describe("writing tool prompts", () => {
  it("headlines: three different strategies, proof over keyword lists, a concise length", () => {
    for (const label of ['"Balanced"', '"Impact"', '"Technical"']) expect(HEADLINE_GENERATION_PROMPT).toContain(label);
    expect(HEADLINE_GENERATION_PROMPT).toContain("Prefer proof");
    expect(HEADLINE_GENERATION_PROMPT).toContain("Never list five or more skills");
    expect(HEADLINE_GENERATION_PROMPT).toContain("70 to 160 characters");
    expect(HEADLINE_GENERATION_PROMPT).toContain("steering, not a checklist");
  });

  it("About: a story with proof, quantified wins and real leadership, 180 to 300 words, never invented", () => {
    expect(ABOUT_GENERATION_PROMPT).toContain("180 to 300 words");
    expect(ABOUT_GENERATION_PROMPT).toContain("quantified wins");
    expect(ABOUT_GENERATION_PROMPT).toContain("I led a five-person team");
    expect(ABOUT_GENERATION_PROMPT).toContain("Never invent skills");
    expect(ABOUT_GENERATION_PROMPT).toContain("never imply LinkedIn already shows it");
    expect(ABOUT_GENERATION_PROMPT).toContain("regeneration");
  });
});
