import type { ScanMode } from "./scanModeStore";

interface ScanModeToggleProps {
  mode: ScanMode;
  onChange: (mode: ScanMode) => void;
}

const MODES: { mode: ScanMode; label: string; hint: string }[] = [
  { mode: "scroll", label: "Analyze as I scroll", hint: "Analyze sections while you browse." },
  { mode: "auto", label: "Auto scan profile", hint: "Quickly scan and analyze the profile for you." },
  { mode: "autoScroll", label: "Auto scroll profile", hint: "Slowly scroll through the profile hands-free while LinkWise reads with you." },
];

// A compact segmented control, only one mode is ever active. Kept small since this is a
// secondary setting, not the panel's main focus.
export function ScanModeToggle({ mode, onChange }: ScanModeToggleProps) {
  return (
    <div className="lw-scan-mode">
      <span className="lw-scan-mode__label">Scan mode</span>
      <div className="lw-scan-mode__control" role="radiogroup" aria-label="Scan mode">
        {MODES.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={mode === option.mode}
            className={`lw-scan-mode__option${mode === option.mode ? " is-active" : ""}`}
            onClick={() => onChange(option.mode)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="lw-scan-mode__hint">{MODES.find((option) => option.mode === mode)?.hint}</p>
    </div>
  );
}
