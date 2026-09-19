import { describe, expect, it } from "vitest";
import { normalizeSummaryLength } from "./normalizeSummary";

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

describe("normalizeSummaryLength - within budget", () => {
  it("returns a summary at or under 60 words unchanged", () => {
    const summary =
      "Daniel has a technical background with hands-on robotics and design experience. His profile shows relevant engineering skills and direct involvement with student robotics. His background aligns with several parts of this search. Direct professional engineering experience is not confirmed, so further discussion would help clarify his fit.";
    expect(words(summary)).toBeLessThanOrEqual(60);
    expect(normalizeSummaryLength(summary)).toBe(summary);
  });

  it("returns an empty string unchanged", () => {
    expect(normalizeSummaryLength("")).toBe("");
    expect(normalizeSummaryLength("   ")).toBe("");
  });
});

describe("normalizeSummaryLength - over budget", () => {
  it("drops whole trailing sentences to get back under 60 words, never exceeding the cap", () => {
    const sentence = "This is a filler sentence with exactly ten plain words in it today.";
    expect(words(sentence)).toBe(13);
    // 6 copies = 78 words, well over the 60-word cap.
    const summary = Array(6).fill(sentence).join(" ");
    const result = normalizeSummaryLength(summary);
    expect(words(result)).toBeLessThanOrEqual(60);
    expect(words(result)).toBeGreaterThan(0);
    // Only whole sentences were kept, result is a clean prefix of the original sentences.
    expect(summary.startsWith(result)).toBe(true);
  });

  it("hard-cuts at a word boundary when even the first sentence alone exceeds the cap, adding terminal punctuation", () => {
    const longSentence = Array(80).fill("word").join(" ") + ".";
    const result = normalizeSummaryLength(longSentence);
    expect(words(result)).toBeLessThanOrEqual(60);
    expect(/[.!?]$/.test(result)).toBe(true);
  });

  it("never returns a result over 60 words for a long multi-sentence summary", () => {
    const summary =
      "Jordan has extensive professional software engineering experience across several companies. The profile lists Python, distributed systems, and backend architecture as core strengths. This aligns closely with the stated goal of finding a senior backend engineer for this specific search today. Leadership experience is present but not confirmed as directly relevant to this particular team's current needs and scope. Overall the evidence here is unusually thorough for a LinkedIn profile of this kind and depth.";
    const result = normalizeSummaryLength(summary);
    expect(words(result)).toBeLessThanOrEqual(60);
  });
});
