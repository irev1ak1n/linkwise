import { describe, expect, it } from "vitest";
import { normalizeText, significantKeywords, stem, splitSentences, truncateSnippet } from "./textNormalize";

describe("normalizeText", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeText("FRC Mentor, Robotics!")).toBe("frc mentor robotics");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeText("Software   Engineer\n\nII")).toBe("software engineer ii");
  });
});

describe("significantKeywords", () => {
  it("removes stopwords", () => {
    expect(significantKeywords("in the field of robotics")).toEqual(["field", "robotics"]);
  });

  it("drops generic qualifier words when a more specific keyword remains", () => {
    // "engineering background" and "engineering experience" mean the same thing for matching,
    // the generic noun adds no real specificity of its own.
    expect(significantKeywords("Experience in the field of robotics")).toEqual(["field", "robotics"]);
    expect(significantKeywords("engineering background")).toEqual(["engineering"]);
  });

  it("keeps a generic qualifier word when it is the only word", () => {
    // Never strip down to nothing, a criterion that's really just "experience" still needs it.
    expect(significantKeywords("experience")).toEqual(["experience"]);
  });

  it("deduplicates repeated words", () => {
    expect(significantKeywords("mentor mentor robotics")).toEqual(["mentor", "robotics"]);
  });

  it("returns an empty array for an all-stopword string", () => {
    expect(significantKeywords("the of in")).toEqual([]);
  });

  it("is deterministic across repeated calls", () => {
    const a = significantKeywords("FRC mentor for robotics teams");
    const b = significantKeywords("FRC mentor for robotics teams");
    expect(a).toEqual(b);
  });
});

describe("stem", () => {
  it("reduces common suffix variants to the same stem", () => {
    expect(stem("engineering")).toBe(stem("engineer"));
    expect(stem("engineers")).toBe(stem("engineer"));
  });

  it("never affects short, specific words like 'mentor'", () => {
    expect(stem("mentor")).toBe("mentor");
  });

  it("never affects short words under its length floor (< 6 characters)", () => {
    expect(stem("frc")).toBe("frc");
    expect(stem("cats")).toBe("cats"); // 4 chars — below the floor, left untouched
  });

  it("does reduce a 6+ character plural to its singular", () => {
    expect(stem("robots")).toBe("robot");
  });
});

describe("splitSentences", () => {
  it("splits on sentence punctuation", () => {
    expect(splitSentences("I lead a team. I mentor students!")).toEqual(["I lead a team.", "I mentor students!"]);
  });
});

describe("truncateSnippet", () => {
  it("returns short text unchanged", () => {
    expect(truncateSnippet("short text")).toBe("short text");
  });

  it("truncates long text around the match index", () => {
    const long = "a".repeat(300) + "MATCH" + "b".repeat(300);
    const result = truncateSnippet(long, 300);
    expect(result.length).toBeLessThan(long.length);
    expect(result).toContain("MATCH");
  });
});
