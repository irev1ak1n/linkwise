import { describe, expect, it } from "vitest";
import { MAX_SECTION_SCROLL_STEPS, nextSectionScanStep, startSectionScan } from "./sectionScan";

const box = (scrollTop: number, scrollHeight = 3000) => ({ scrollTop, clientHeight: 700, scrollHeight });

describe("nextSectionScanStep", () => {
  it("waits for the section to render first", () => {
    expect(nextSectionScanStep(startSectionScan("u", 1000, 0), 1500, 1500, box(0))).toBe("wait");
  });

  it("scrolls until the end of the section, then finishes and extracts", () => {
    const state = startSectionScan("u", 0, 0);
    expect(nextSectionScanStep(state, 2000, 1500, box(0))).toBe("scroll");
    expect(nextSectionScanStep(state, 2000, 1500, box(2300))).toBe("finish-scroll");
    state.scrolled = true;
    expect(nextSectionScanStep(state, 2000, 1500, box(2300))).toBe("extract");
  });

  it("never scrolls more than the step limit, even if the page keeps growing", () => {
    const state = startSectionScan("u", 0, 0);
    state.steps = MAX_SECTION_SCROLL_STEPS;
    expect(nextSectionScanStep(state, 2000, 1500, box(0, 100000))).toBe("finish-scroll");
  });

  it("skips scrolling for a section that already fits", () => {
    expect(nextSectionScanStep(startSectionScan("u", 0, 0), 2000, 1500, box(0, 600))).toBe("finish-scroll");
  });
});
