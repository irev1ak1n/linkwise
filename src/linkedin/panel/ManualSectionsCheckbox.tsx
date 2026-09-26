interface ManualSectionsCheckboxProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function ManualSectionsCheckbox({ enabled, onChange }: ManualSectionsCheckboxProps) {
  return (
    <div className="lw-enhanced-analysis">
      <label className="lw-enhanced-analysis__label">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
        Analyze sections I open
      </label>
      <p className="lw-enhanced-analysis__hint">Add information from profile sections you visit.</p>
    </div>
  );
}
