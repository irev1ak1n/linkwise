import { describe, expect, it } from "vitest";
import { decideCardAction, highlightColorFor, type CardEvidence, type JobFilterRules } from "./jobFilterEngine";
import { DEFAULT_JOBS_SETTINGS } from "../../models/jobsSettings";

function evidence(overrides: Partial<CardEvidence> = {}): CardEvidence {
  return { applied: false, viewed: false, saved: false, matchedKeyword: null, ...overrides };
}

function rules(overrides: Partial<JobFilterRules> = {}): JobFilterRules {
  return { appliedAction: "none", viewedAction: "none", savedAction: "none", keywordAction: "none", ...overrides };
}

describe("decideCardAction", () => {
  it("does nothing when no evidence matches any rule", () => {
    expect(decideCardAction(evidence(), rules({ appliedAction: "hide", keywordAction: "hide" }))).toBe("none");
  });

  it("hides an applied card when appliedAction is hide", () => {
    expect(decideCardAction(evidence({ applied: true }), rules({ appliedAction: "hide" }))).toBe("hide");
  });

  it("highlights a viewed card when viewedAction is highlight", () => {
    expect(decideCardAction(evidence({ viewed: true }), rules({ viewedAction: "highlight" }))).toBe("highlight");
  });

  it("hides a saved card when savedAction is hide", () => {
    expect(decideCardAction(evidence({ saved: true }), rules({ savedAction: "hide" }))).toBe("hide");
  });

  it("does nothing for a matching state when its action is none", () => {
    expect(decideCardAction(evidence({ applied: true, viewed: true, saved: true }), rules())).toBe("none");
  });

  it("hides a keyword match when keywordAction is hide", () => {
    expect(decideCardAction(evidence({ matchedKeyword: "Senior" }), rules({ keywordAction: "hide" }))).toBe("hide");
  });

  it("applied, viewed, and saved act independently at the same time", () => {
    const e = evidence({ applied: true, viewed: true, saved: true });
    expect(decideCardAction(e, rules({ appliedAction: "hide", viewedAction: "highlight", savedAction: "none" }))).toBe("hide");
  });

  it("hide wins over highlight regardless of which rule contributed it", () => {
    expect(decideCardAction(evidence({ saved: true, matchedKeyword: "Developer" }), rules({ savedAction: "highlight", keywordAction: "hide" }))).toBe(
      "hide",
    );
  });

  it("highlight applies once even when multiple rules say highlight", () => {
    expect(
      decideCardAction(evidence({ viewed: true, saved: true, matchedKeyword: "Senior" }), rules({ viewedAction: "highlight", savedAction: "highlight", keywordAction: "highlight" })),
    ).toBe("highlight");
  });
});

describe("highlightColorFor", () => {
  const settings = {
    ...DEFAULT_JOBS_SETTINGS,
    appliedAction: "highlight" as const,
    viewedAction: "highlight" as const,
    savedAction: "highlight" as const,
    keywordAction: "highlight" as const,
    appliedColor: "coral" as const,
    viewedColor: "green" as const,
    savedColor: "violet" as const,
    keywordColor: "yellow" as const,
  };

  it("uses each status's own color", () => {
    expect(highlightColorFor(evidence({ applied: true }), settings)).toBe("coral");
    expect(highlightColorFor(evidence({ viewed: true }), settings)).toBe("green");
    expect(highlightColorFor(evidence({ saved: true }), settings)).toBe("violet");
    expect(highlightColorFor(evidence({ matchedKeyword: "Senior" }), settings)).toBe("yellow");
  });

  it("picks applied, then viewed, then saved, then keyword when several highlight one card", () => {
    expect(highlightColorFor(evidence({ viewed: true, saved: true, matchedKeyword: "Senior" }), settings)).toBe("green");
    expect(highlightColorFor(evidence({ saved: true, matchedKeyword: "Senior" }), settings)).toBe("violet");
  });

  it("ignores a matching status that does not highlight", () => {
    expect(highlightColorFor(evidence({ applied: true, matchedKeyword: "Senior" }), { ...settings, appliedAction: "none" })).toBe("yellow");
  });
});
