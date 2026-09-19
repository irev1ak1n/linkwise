import type { ScanMode } from "./scanModeStore";

interface ScanModeToggleProps {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}

const HINTS: Record<ScanMode, string> = {
  scroll: "Analyze sections while you browse.",
  auto: "Automatically scan the full profile.",
};

// A compact segmented control, only one mode is ever active. Kept small since this is a
// secondary setting, not the panel's main focus.
export function ScanModeToggle({ mode, onChange }: ScanModeToggleProps) {
  return (
    <div className="lw-scan-mode">
      <span className="lw-scan-mode__label">Scan mode</span>
      <div className="lw-scan-mode__control" role="radiogroup" aria-label="Scan mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "scroll"}
          className={`lw-scan-mode__option${mode === "scroll" ? " is-active" : ""}`}
          onClick={() => onChange("scroll")}
        >
          Analyze as I scroll
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "auto"}
          className={`lw-scan-mode__option${mode === "auto" ? " is-active" : ""}`}
          onClick={() => onChange("auto")}
        >
          Auto scan profile
        </button>
      </div>
      <p className="lw-scan-mode__hint">{HINTS[mode]}</p>
    </div>
  );
}
