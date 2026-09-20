import { describe, expect, it } from "vitest";
import { clampTopPx, DRAG_THRESHOLD_PX, isDrag } from "./dragPosition";

describe("isDrag", () => {
  it("is false for zero movement", () => {
    expect(isDrag(0)).toBe(false);
  });

  it("is false right at the threshold, a steady click shouldn't be treated as a drag", () => {
    expect(isDrag(DRAG_THRESHOLD_PX)).toBe(false);
  });

  it("is true just past the threshold", () => {
    expect(isDrag(DRAG_THRESHOLD_PX + 1)).toBe(true);
  });

  it("is true for a large movement", () => {
    expect(isDrag(400)).toBe(true);
  });
});

describe("clampTopPx", () => {
  it("leaves a position that's already fully on screen unchanged", () => {
    expect(clampTopPx(300, 800, 40)).toBe(300);
  });

  it("clamps a negative top back to 0", () => {
    expect(clampTopPx(-50, 800, 40)).toBe(0);
  });

  it("clamps so the bottom edge never goes past the viewport", () => {
    expect(clampTopPx(790, 800, 40)).toBe(760); // 800 - 40
  });

  it("never produces a negative max top for a tiny viewport smaller than the element", () => {
    expect(clampTopPx(50, 20, 40)).toBe(0);
  });

  it("keeps the element pinned to 0 when the element is exactly the viewport height", () => {
    expect(clampTopPx(100, 400, 400)).toBe(0);
  });
});
