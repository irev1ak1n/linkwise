import { describe, expect, it } from "vitest";
import { decideCardAction } from "./jobFilterEngine";

describe("decideCardAction", () => {
  it("does nothing for a non-applied, non-matching card", () => {
    expect(decideCardAction({ applied: false, matchedKeyword: null }, { appliedAction: "hide", keywordAction: "hide" })).toBe("none");
  });

  it("hides an applied card when appliedAction is hide", () => {
    expect(decideCardAction({ applied: true, matchedKeyword: null }, { appliedAction: "hide", keywordAction: "none" })).toBe("hide");
  });

  it("highlights an applied card when appliedAction is highlight", () => {
    expect(decideCardAction({ applied: true, matchedKeyword: null }, { appliedAction: "highlight", keywordAction: "none" })).toBe("highlight");
  });

  it("does nothing for an applied card when appliedAction is none", () => {
    expect(decideCardAction({ applied: true, matchedKeyword: null }, { appliedAction: "none", keywordAction: "hide" })).toBe("none");
  });

  it("hides a keyword match when keywordAction is hide", () => {
    expect(decideCardAction({ applied: false, matchedKeyword: "Senior" }, { appliedAction: "none", keywordAction: "hide" })).toBe("hide");
  });

  it("highlights a keyword match when keywordAction is highlight", () => {
    expect(decideCardAction({ applied: false, matchedKeyword: "Senior" }, { appliedAction: "none", keywordAction: "highlight" })).toBe("highlight");
  });

  it("prefers hide over highlight when applied says hide and keyword says highlight", () => {
    expect(decideCardAction({ applied: true, matchedKeyword: "Senior" }, { appliedAction: "hide", keywordAction: "highlight" })).toBe("hide");
  });

  it("prefers hide over highlight when keyword says hide and applied says highlight", () => {
    expect(decideCardAction({ applied: true, matchedKeyword: "Senior" }, { appliedAction: "highlight", keywordAction: "hide" })).toBe("hide");
  });

  it("highlights when both rules say highlight", () => {
    expect(decideCardAction({ applied: true, matchedKeyword: "Senior" }, { appliedAction: "highlight", keywordAction: "highlight" })).toBe("highlight");
  });
});
