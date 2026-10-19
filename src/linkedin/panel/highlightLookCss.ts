import type { CSSProperties } from "react";
import { highlightRender, type LookedStyle } from "../highlightPalette";

/** The panel's version of a highlight: the same ::highlight() declarations as on LinkedIn, plus
 * real borders where the page draws them with an overlay (Dashed, Left Border). */
export function highlightLookCss(style: LookedStyle): CSSProperties {
  const { highlight, outline } = highlightRender(style);
  const css: CSSProperties = { ...highlight };
  if (outline?.kind === "dashed") Object.assign(css, { border: `1.5px dashed ${outline.color}`, borderRadius: "4px", padding: "0 3px" });
  // Only the phrase's first line gets the accent, as on the page.
  if (outline?.kind === "left") Object.assign(css, { borderLeft: `3px solid ${outline.color}`, borderRadius: "0", padding: "0 0 0 5px", boxDecorationBreak: "slice", WebkitBoxDecorationBreak: "slice" });
  return css;
}
