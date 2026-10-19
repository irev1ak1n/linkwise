import { parseRgba, rgba, underlineColor } from "./highlightColor";

// Soft highlighter colors for Signal Mode, light enough to keep LinkedIn's black text readable.
// "fill" is the phrase background, "mark" underlines the numbers inside it, "swatch" is the
// opaque color shown in the panel.
export const HIGHLIGHT_COLORS = ["green", "mint", "purple", "violet", "blue", "coral", "orange", "yellow"] as const;
// Profile highlight categories need a few more distinct pastels than one highlight color did.
export const PROFILE_HIGHLIGHT_COLORS = ["yellow", "orange", "coral", "pink", "purple", "violet", "blue", "sky", "mint", "green"] as const;
export type HighlightColor = (typeof PROFILE_HIGHLIGHT_COLORS)[number];
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = "blue";
// Profile keyword matches have always been amber, so they keep it until the user picks a color.
export const DEFAULT_KEYWORD_HIGHLIGHT_COLOR: HighlightColor = "orange";

export interface HighlightShade {
  label: string;
  fill: string;
  mark: string;
  swatch: string;
}

export const HIGHLIGHT_SHADES: Record<HighlightColor, HighlightShade> = {
  green: { label: "Green", fill: "rgba(76, 175, 80, 0.26)", mark: "rgba(46, 125, 50, 0.9)", swatch: "#b9e3b4" },
  mint: { label: "Mint", fill: "rgba(0, 191, 165, 0.22)", mark: "rgba(0, 121, 107, 0.9)", swatch: "#b2ebe0" },
  purple: { label: "Purple", fill: "rgba(186, 104, 200, 0.24)", mark: "rgba(123, 31, 162, 0.85)", swatch: "#e1bee7" },
  violet: { label: "Violet", fill: "rgba(126, 87, 194, 0.22)", mark: "rgba(81, 45, 168, 0.85)", swatch: "#d1c4e9" },
  blue: { label: "Blue", fill: "rgba(10, 102, 194, 0.14)", mark: "rgba(10, 102, 194, 0.85)", swatch: "#bcd6f2" },
  sky: { label: "Sky", fill: "rgba(3, 169, 244, 0.18)", mark: "rgba(2, 119, 189, 0.85)", swatch: "#b3e5fc" },
  pink: { label: "Pink", fill: "rgba(240, 98, 146, 0.22)", mark: "rgba(173, 20, 87, 0.85)", swatch: "#f8bbd0" },
  coral: { label: "Coral", fill: "rgba(255, 112, 97, 0.26)", mark: "rgba(198, 40, 40, 0.85)", swatch: "#ffc4bb" },
  orange: { label: "Orange", fill: "rgba(240, 180, 20, 0.32)", mark: "rgba(150, 90, 0, 0.9)", swatch: "#ffd8a8" },
  yellow: { label: "Yellow", fill: "rgba(255, 235, 59, 0.5)", mark: "rgba(170, 130, 0, 0.95)", swatch: "#fff59d" },
};

export function toHighlightColor(value: unknown): HighlightColor | undefined {
  return PROFILE_HIGHLIGHT_COLORS.find((color) => color === value);
}

/** A color the user chose in the color editor: the opaque color and how solid the highlight is. */
export interface CustomHighlightColor {
  /** "#RRGGBB" */
  hex: string;
  /** 0 is invisible, 1 fully solid. */
  opacity: number;
}

export interface ColoredStyle {
  color: HighlightColor;
  custom?: CustomHighlightColor;
}

/** How a style is drawn: its custom color when it has one, else its preset shade. */
export function shadeFor(style: ColoredStyle): HighlightShade {
  if (!style.custom) return HIGHLIGHT_SHADES[style.color];
  const { hex, opacity } = style.custom;
  return { label: hex, fill: rgba(hex, opacity), mark: underlineColor(hex), swatch: hex };
}

/** The base color and opacity a style opens with in the color editor. */
export function editableColor(style: ColoredStyle): CustomHighlightColor {
  return style.custom ?? parseRgba(HIGHLIGHT_SHADES[style.color].fill)!;
}

export interface HighlightDeclarations {
  backgroundColor: string;
  textDecoration: string;
  textUnderlineOffset?: string;
}

// One definition of how a highlight looks, used for the ::highlight() rules on LinkedIn and for
// the panel's previews, so a preview always matches the page.
export function highlightDeclarations(style: ColoredStyle & { underline: boolean }, dotted = false): HighlightDeclarations {
  const { fill, mark } = shadeFor(style);
  if (!style.underline) return { backgroundColor: fill, textDecoration: "none" };
  return { backgroundColor: fill, textDecoration: `underline ${dotted ? "dotted " : ""}2px ${mark}`, textUnderlineOffset: "3px" };
}

export function highlightCss(d: HighlightDeclarations): string {
  return `background-color: ${d.backgroundColor}; text-decoration: ${d.textDecoration};${d.textUnderlineOffset ? ` text-underline-offset: ${d.textUnderlineOffset};` : ""}`;
}
