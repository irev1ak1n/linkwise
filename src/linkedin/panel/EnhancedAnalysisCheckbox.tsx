interface EnhancedAnalysisCheckboxProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

// Only meaningful in Auto scan mode, PanelApp only renders this while that mode is selected.
export function EnhancedAnalysisCheckbox({ enabled, onChange }: EnhancedAnalysisCheckboxProps) {
  return (
    <div className="lw-enhanced-analysis">
      <label className="lw-enhanced-analysis__label">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
        Enhanced analysis
      </label>
      <p className="lw-enhanced-analysis__hint">Open profile sections for a more complete analysis.</p>
    </div>
  );
}
