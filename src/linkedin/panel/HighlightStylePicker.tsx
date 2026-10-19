import { HIGHLIGHT_LOOKS, type HighlightLook, type LookedStyle } from "../highlightPalette";
import { highlightLookCss } from "./highlightLookCss";

const LOOK_LABELS: Record<HighlightLook, string> = {
  solid: "Solid",
  soft: "Soft",
  underline: "Underline",
  text: "Text Color",
  dashed: "Dashed",
  "left-border": "Left Border",
};

// Six ways to draw the same phrase, each card showing its look in the rule's current color: the
// color picker decides the color, this decides how it is applied.
export function HighlightStylePicker({ name, style, onChange }: { name: string; style: LookedStyle; onChange: (look: HighlightLook) => void }) {
  const current = style.look ?? "solid";
  return (
    <section className="lw-hs" aria-label={`${name} highlight style`}>
      <h4 className="lw-ce__heading">Highlight Style</h4>
      <div className="lw-hs__grid" role="radiogroup" aria-label="Highlight style">
        {HIGHLIGHT_LOOKS.map((look) => (
          <button
            key={look}
            type="button"
            role="radio"
            aria-checked={look === current}
            className={look === current ? "lw-hs__card lw-hs__card--selected" : "lw-hs__card"}
            onClick={() => onChange(look)}
          >
            <span className="lw-hs__sample" aria-hidden="true">
              <span className="lw-hs__mark" style={highlightLookCss({ ...style, look })}>
                {look === "text" ? "Abc" : "Aa"}
              </span>
            </span>
            <span className="lw-hs__label">{LOOK_LABELS[look]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
