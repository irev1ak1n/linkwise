interface ExpandDetailsCheckboxProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  hint?: string;
}

export function ExpandDetailsCheckbox({ enabled, onChange, hint }: ExpandDetailsCheckboxProps) {
  const label = (
    <label className="lw-expand-details">
      <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      Expand profile details automatically
    </label>
  );
  if (!hint) return label;
  return (
    <div>
      {label}
      <p className="lw-enhanced-analysis__hint">{hint}</p>
    </div>
  );
}
