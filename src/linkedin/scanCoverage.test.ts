import { describe, expect, it } from "vitest";
import { deriveScanCoverage, shouldAttemptAutoScroll } from "./scanCoverage";
import { initialCollectionState, type CollectionState } from "../models/collection";

function collection(overrides: Partial<CollectionState>): CollectionState {
  return { ...initialCollectionState(0), ...overrides };
}

describe("deriveScanCoverage", () => {
  it("is 'untouched' when there is no collection state at all", () => {
    expect(deriveScanCoverage(null)).toBe("untouched");
  });

  it("is 'untouched' when nothing has been found yet, even if sections are detected", () => {
    expect(deriveScanCoverage(collection({ sectionsFound: [], sectionsDetected: ["about"] }))).toBe("untouched");
  });

  it("is 'partial' while still collecting, even with real evidence found", () => {
    expect(deriveScanCoverage(collection({ status: "collecting", sectionsFound: ["about"] }))).toBe("partial");
  });

  it("is 'partial' when settled early without reaching the real document end (scroll mode's own settle-on-enough-evidence path)", () => {
    expect(deriveScanCoverage(collection({ status: "settled", sectionsFound: ["about"], reachedDocumentEnd: false }))).toBe("partial");
  });

  it("is 'complete' only once settled AND the real document end was reached", () => {
    expect(deriveScanCoverage(collection({ status: "settled", sectionsFound: ["about"], reachedDocumentEnd: true }))).toBe("complete");
  });

  it("never reports 'complete' merely because a score could be computed — collection state is the only signal it reads", () => {
    // A goal/score is not part of CollectionState at all, so an early settle can never look
    // like "complete" just because a Match % happens to exist elsewhere in the app.
    const partiallyCovered = collection({ status: "settled", sectionsFound: ["about", "skills"], reachedDocumentEnd: false });
    expect(deriveScanCoverage(partiallyCovered)).toBe("partial");
  });
});

describe("shouldAttemptAutoScroll - the one strict gate", () => {
  it("is always false in 'scroll' mode, regardless of coverage", () => {
    expect(shouldAttemptAutoScroll("scroll", "untouched")).toBe(false);
    expect(shouldAttemptAutoScroll("scroll", "partial")).toBe(false);
    expect(shouldAttemptAutoScroll("scroll", "complete")).toBe(false);
  });

  it("is true in 'auto' mode when coverage is untouched or partial", () => {
    expect(shouldAttemptAutoScroll("auto", "untouched")).toBe(true);
    expect(shouldAttemptAutoScroll("auto", "partial")).toBe(true);
  });

  it("is false in 'auto' mode once coverage is complete — nothing left to scan for this profile", () => {
    expect(shouldAttemptAutoScroll("auto", "complete")).toBe(false);
  });
});

describe("scan mode transitions", () => {
  it("scroll -> auto with incomplete coverage: should start auto-scrolling the current profile", () => {
    const untouched = collection({ status: "collecting", sectionsFound: [] });
    const partial = collection({ status: "collecting", sectionsFound: ["about"] });
    expect(shouldAttemptAutoScroll("auto", deriveScanCoverage(untouched))).toBe(true);
    expect(shouldAttemptAutoScroll("auto", deriveScanCoverage(partial))).toBe(true);
  });

  it("scroll -> auto with complete coverage: should not rescan the current profile", () => {
    const complete = collection({ status: "settled", sectionsFound: ["about"], reachedDocumentEnd: true });
    expect(shouldAttemptAutoScroll("auto", deriveScanCoverage(complete))).toBe(false);
  });

  it("auto -> scroll while a scan is still in progress: must stop immediately regardless of coverage", () => {
    const partial = collection({ status: "collecting", sectionsFound: ["about"] });
    expect(shouldAttemptAutoScroll("scroll", deriveScanCoverage(partial))).toBe(false);
  });

  it("auto -> scroll after a scan already completed: stays false, no rescan", () => {
    const complete = collection({ status: "settled", sectionsFound: ["about"], reachedDocumentEnd: true });
    expect(shouldAttemptAutoScroll("scroll", deriveScanCoverage(complete))).toBe(false);
  });

  it("repeated scroll <-> auto toggling on the same incomplete profile never disagrees with itself", () => {
    const partial = collection({ status: "collecting", sectionsFound: ["about"] });
    const coverage = deriveScanCoverage(partial);
    expect(shouldAttemptAutoScroll("auto", coverage)).toBe(true);
    expect(shouldAttemptAutoScroll("scroll", coverage)).toBe(false);
    expect(shouldAttemptAutoScroll("auto", coverage)).toBe(true);
    expect(shouldAttemptAutoScroll("scroll", coverage)).toBe(false);
  });
});
