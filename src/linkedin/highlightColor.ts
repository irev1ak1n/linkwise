// Color math for the highlight color editor: HEX, RGB, and HSV (the square and hue slider) are
// three views of one color, and opacity is kept apart since it belongs to the highlight, not to
// the color. Pure functions, no DOM.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  v: number;
}

export const clampChannel = (value: number): number => Math.min(255, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** "#4f46e5", "4F46E5" and " #4F46E5 " all read as "#4F46E5". Anything else is not a color yet:
 * "#4F4" is someone still typing, not shorthand, so it never replaces the current color. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((c) => clampChannel(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const d = max - Math.min(rn, gn, bn);
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const sat = clamp01(s);
  const val = clamp01(v);
  const f = (n: number) => {
    const k = (n + (((h % 360) + 360) % 360) / 60) % 6;
    return val - val * sat * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: clampChannel(f(5) * 255), g: clampChannel(f(3) * 255), b: clampChannel(f(1) * 255) };
}

/** The highlight drawn on the page: the color at the chosen opacity. */
export function rgba(hex: string, opacity: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(opacity) * 100) / 100})`;
}

// Underlines need to read on top of their own fill, so they use a darker shade of the color.
export function underlineColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(b * 0.6)}, 0.9)`;
}

/** "rgba(10, 102, 194, 0.14)" as a color and an opacity, so a preset opens in the editor as it looks. */
export function parseRgba(value: string): { hex: string; opacity: number } | null {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value.trim());
  if (!m) return null;
  return { hex: rgbToHex({ r: +m[1]!, g: +m[2]!, b: +m[3]! }), opacity: m[4] === undefined ? 1 : clamp01(+m[4]) };
}

// WCAG relative luminance, for keeping colored text and lines legible on LinkedIn's white.
function luminance({ r, g, b }: Rgb): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hexToRgb(hex)) + 0.05);
}

/** The color itself when it already reads on white, else the closest darker shade that does:
 * a pastel yellow chosen for backgrounds would be unreadable as text. */
export function readableOnWhite(hex: string, minContrast: number): string {
  const base = hexToRgb(hex);
  for (let k = 0; k <= 1.0001; k += 0.02) {
    const shade = rgbToHex({ r: base.r * (1 - k), g: base.g * (1 - k), b: base.b * (1 - k) });
    if (contrastOnWhite(shade) >= minContrast) return shade;
  }
  return "#000000";
}
