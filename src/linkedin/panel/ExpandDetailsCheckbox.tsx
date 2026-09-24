interface ExpandDetailsCheckboxProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

// Only meaningful in "Analyze as I scroll" mode (Auto scan always expands safe profile details
// regardless of this), so PanelApp only renders this while that mode is selected.
export function ExpandDetailsCheckbox({ enabled, onChange }: ExpandDetailsCheckboxProps) {
  return (
    <label className="lw-expand-details">
      <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      Expand profile details automatically
    </label>
  );
}
