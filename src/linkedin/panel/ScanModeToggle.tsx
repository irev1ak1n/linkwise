import type { ScanMode } from "./scanModeStore";

interface ScanModeToggleProps {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}

const MODES: { mode: ScanMode; lines: [string, string] }[] = [
  { mode: "scroll", lines: ["Analyze", "as I scroll"] },
  { mode: "auto", lines: ["Auto scan", "profile"] },
];

const ART = "content/assets/scan-mode-card.webp";

// The chooser's art (panels, icons, glow) is one image with no text and no selection baked in;
// the title, the two modes, and which one is selected are real interface laid over it, so the
// picture can never show a different mode than the one in use. Only one mode is ever active.
export function ScanModeToggle({ mode, onChange }: ScanModeToggleProps) {
  const art = typeof chrome !== "undefined" ? chrome.runtime?.getURL?.(ART) : undefined;
  return (
    <div className="lw-sm">
      <img className="lw-sm__art" src={art || undefined} width={1337} height={765} alt="" draggable={false} />
      <div className="lw-sm__head">
        <span className="lw-sm__title">Scan mode</span>
        <span className="lw-sm__subtitle">Choose how LinkWise analyzes the profile.</span>
      </div>
      <div className="lw-sm__options" role="radiogroup" aria-label="Scan mode">
        {MODES.map((option) => {
          const selected = mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`lw-sm__option lw-sm__option--${option.mode}${selected ? " is-selected" : ""}`}
              onClick={() => onChange(option.mode)}
            >
              <span className="lw-sm__label">
                <span>{option.lines[0]}</span> <span>{option.lines[1]}</span>
              </span>
              {selected && (
                <span className="lw-sm__check" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 12.5 4 4 8-9" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
