import { HIGHLIGHT_COLORS, HIGHLIGHT_SHADES, type HighlightColor } from "../highlightPalette";

interface HighlightColorPickerProps {
  color: HighlightColor;
  onChange: (color: HighlightColor) => void;
}

export function HighlightColorPicker({ color, onChange }: HighlightColorPickerProps) {
  return (
    <div className="lw-colors" role="radiogroup" aria-label="Highlight color">
      <span className="lw-colors__label">Highlight color</span>
      <span className="lw-colors__swatches">
        {HIGHLIGHT_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === color}
            aria-label={HIGHLIGHT_SHADES[option].label}
            title={HIGHLIGHT_SHADES[option].label}
            className={option === color ? "lw-colors__swatch lw-colors__swatch--selected" : "lw-colors__swatch"}
            style={{ backgroundColor: HIGHLIGHT_SHADES[option].swatch }}
            onClick={() => onChange(option)}
          />
        ))}
      </span>
    </div>
  );
}
