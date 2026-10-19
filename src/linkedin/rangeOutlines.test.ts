// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RangeOutlines } from "./rangeOutlines";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

function rangeWith(rects: DOMRect[]): Range {
  const range = document.createRange();
  range.selectNodeContents(document.querySelector("p")!);
  (range as unknown as { getClientRects: () => DOMRect[] }).getClientRects = () => rects;
  return range;
}

beforeEach(() => {
  document.body.innerHTML = "<main><p>Led a five-person team across two product launches</p></main>";
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (cb(0), 1));
});

afterEach(() => vi.unstubAllGlobals());

describe("RangeOutlines", () => {
  it("draws a dashed box around every line of a phrase, over the page without touching it", () => {
    const before = document.querySelector("main")!.innerHTML;
    const outlines = new RangeOutlines(document, "lw-test-outlines");
    outlines.set("leadership", [rangeWith([rect(10, 100, 200, 18), rect(10, 120, 80, 18)])], { kind: "dashed", color: "rgba(1, 2, 3, 0.8)" });
    const root = document.getElementById("lw-test-outlines")!;
    expect(root.style.position).toBe("fixed");
    expect(root.style.pointerEvents).toBe("none");
    const boxes = [...root.children] as HTMLElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.style.border).toContain("dashed");
    expect(boxes[0]!.style.left).toBe("8px");
    expect(document.querySelector("main")!.innerHTML).toBe(before);
    outlines.clear();
    expect(document.getElementById("lw-test-outlines")).toBeNull();
  });

  it("draws a left border only at the start of a phrase, and skips empty line boxes", () => {
    const outlines = new RangeOutlines(document, "lw-test-outlines");
    outlines.set("projects", [rangeWith([rect(0, 0, 0, 0), rect(40, 60, 120, 18), rect(10, 80, 90, 18)])], { kind: "left", color: "rgb(1, 2, 3)" });
    const boxes = [...document.getElementById("lw-test-outlines")!.children] as HTMLElement[];
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.style.left).toBe("35px");
    expect(boxes[0]!.style.width).toBe("3px");
    // A layer whose look no longer has an outline is removed.
    outlines.set("projects", [rangeWith([rect(40, 60, 120, 18)])], null);
    expect(document.getElementById("lw-test-outlines")).toBeNull();
  });
});
