import { describe, expect, it } from "vitest";
import { countSentences, countWords } from "./summaryQuality";

const EXAMPLE_SUMMARY =
  'Daniel has a technical background with hands-on robotics and design experience. His profile shows relevant engineering skills and direct involvement with student robotics. His background aligns with several parts of this search. Direct professional engineering experience is not confirmed, so further discussion would help clarify his fit.';

describe("countSentences", () => {
  it("counts the target example summary as exactly 4 sentences", () => {
    expect(countSentences(EXAMPLE_SUMMARY)).toBe(4);
  });

  it("counts a 2-sentence summary as 2", () => {
    expect(countSentences("First sentence here. Second sentence here.")).toBe(2);
  });

  it("counts a 5-sentence summary as 5", () => {
    expect(countSentences("One. Two. Three. Four. Five.")).toBe(5);
  });

  it("treats a summary with no terminal punctuation as one sentence", () => {
    expect(countSentences("No terminal punctuation here")).toBe(1);
  });

  it("counts an empty string as zero sentences", () => {
    expect(countSentences("")).toBe(0);
  });
});

describe("countWords", () => {
  it("counts the target example summary within the 45-55 word acceptable range", () => {
    const words = countWords(EXAMPLE_SUMMARY);
    expect(words).toBeGreaterThanOrEqual(45);
    expect(words).toBeLessThanOrEqual(55);
  });

  it("counts words separated by multiple spaces correctly", () => {
    expect(countWords("one   two    three")).toBe(3);
  });

  it("counts an empty string as zero words", () => {
    expect(countWords("")).toBe(0);
  });
});
