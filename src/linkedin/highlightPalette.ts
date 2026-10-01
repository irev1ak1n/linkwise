// Soft highlighter colors for Signal Mode, light enough to keep LinkedIn's black text readable.
// "fill" is the phrase background, "mark" underlines the numbers inside it, "swatch" is the
// opaque color shown in the panel.
export const HIGHLIGHT_COLORS = ["green", "mint", "purple", "violet", "blue", "coral", "orange", "yellow"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];
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
  coral: { label: "Coral", fill: "rgba(255, 112, 97, 0.26)", mark: "rgba(198, 40, 40, 0.85)", swatch: "#ffc4bb" },
  orange: { label: "Orange", fill: "rgba(240, 180, 20, 0.32)", mark: "rgba(150, 90, 0, 0.9)", swatch: "#ffd8a8" },
  yellow: { label: "Yellow", fill: "rgba(255, 235, 59, 0.5)", mark: "rgba(170, 130, 0, 0.95)", swatch: "#fff59d" },
};

export function toHighlightColor(value: unknown): HighlightColor | undefined {
  return HIGHLIGHT_COLORS.find((color) => color === value);
}
