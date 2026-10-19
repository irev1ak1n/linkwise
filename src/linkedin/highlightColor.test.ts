import { describe, expect, it } from "vitest";
import { clampChannel, contrastOnWhite, hexToRgb, hsvToRgb, normalizeHex, parseRgba, readableOnWhite, rgba, rgbToHex, rgbToHsv } from "./highlightColor";
import { editableColor, highlightRender, shadeFor } from "./highlightPalette";

describe("highlight color math", () => {
  it("normalizes complete HEX values only", () => {
    expect(normalizeHex("4f46e5")).toBe("#4F46E5");
    expect(normalizeHex(" #4F46E5 ")).toBe("#4F46E5");
    expect(normalizeHex("#4F4")).toBeNull();
    expect(normalizeHex("#4F46E")).toBeNull();
    expect(normalizeHex("#GGGGGG")).toBeNull();
  });

  it("converts between HEX, RGB, and HSV both ways", () => {
    expect(hexToRgb("#FACC15")).toEqual({ r: 250, g: 204, b: 21 });
    expect(rgbToHex({ r: 250, g: 204, b: 21 })).toBe("#FACC15");
    for (const hex of ["#FACC15", "#4F46E5", "#000000", "#FFFFFF", "#0A66C2", "#22C55E"]) {
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
    }
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
  });

  it("clamps channels to 0–255", () => {
    expect(clampChannel(300)).toBe(255);
    expect(clampChannel(-4)).toBe(0);
    expect(clampChannel(Number.NaN)).toBe(0);
  });

  it("reads a preset's rgba as a color and an opacity", () => {
    expect(parseRgba("rgba(10, 102, 194, 0.14)")).toEqual({ hex: "#0A66C2", opacity: 0.14 });
    expect(rgba("#FACC15", 0.35)).toBe("rgba(250, 204, 21, 0.35)");
  });

  it("draws a custom color in place of the preset, and a preset as it always was", () => {
    expect(shadeFor({ color: "blue" }).fill).toBe("rgba(10, 102, 194, 0.14)");
    expect(shadeFor({ color: "blue", custom: { hex: "#FACC15", opacity: 0.35 } }).fill).toBe("rgba(250, 204, 21, 0.35)");
    expect(editableColor({ color: "yellow" })).toEqual({ hex: "#FFEB3B", opacity: 0.5 });
    expect(highlightRender({ color: "blue", look: "solid", custom: { hex: "#FACC15", opacity: 1 } }).highlight.backgroundColor).toBe("rgba(250, 204, 21, 1)");
  });

  it("keeps colored text readable and leaves dark colors alone", () => {
    expect(contrastOnWhite(readableOnWhite("#FFEB3B", 4.5))).toBeGreaterThanOrEqual(4.5);
    expect(readableOnWhite("#1D4ED8", 4.5)).toBe("#1D4ED8");
    expect(highlightRender({ color: "yellow", look: "text" }).highlight.color).toBe(readableOnWhite("#FFEB3B", 4.5));
  });
});
