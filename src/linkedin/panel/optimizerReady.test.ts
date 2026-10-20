import { describe, expect, it } from "vitest";
import { optimizerReadyToAnalyze } from "./PanelApp";

describe("optimizerReadyToAnalyze", () => {
  it("waits for the whole-profile crawl, never analyzing the main page alone first", () => {
    expect(optimizerReadyToAnalyze(false, null, "settled")).toBe(false);
    expect(optimizerReadyToAnalyze(false, "scanning", "settled")).toBe(false);
  });

  it("waits for the page's own reading to settle after the crawl, so it sends once", () => {
    expect(optimizerReadyToAnalyze(false, "complete", "collecting")).toBe(false);
    expect(optimizerReadyToAnalyze(false, "complete", "settled")).toBe(true);
  });

  it("analyzes what it has when the user asks", () => {
    expect(optimizerReadyToAnalyze(true, "scanning", "collecting")).toBe(true);
  });
});
