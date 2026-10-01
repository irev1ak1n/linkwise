import type { JobCardAction, JobsSettings } from "../../models/jobsSettings";
import type { HighlightColor } from "../highlightPalette";
import { HighlightColorPicker } from "./HighlightColorPicker";

interface JobsSettingsSectionProps {
  settings: JobsSettings;
  onChange: (settings: JobsSettings) => void;
}

const ACTION_LABELS: Record<JobCardAction, string> = {
  none: "Do nothing",
  hide: "Hide",
  highlight: "Highlight",
};

const ACTIONS: JobCardAction[] = ["none", "hide", "highlight"];

// The color choice only appears while the rule actually highlights.
function ActionRadioGroup({
  name,
  label,
  value,
  onChange,
  color,
  onColorChange,
  colorLabel = `${label} color`,
}: {
  name: string;
  label: string;
  colorLabel?: string;
  value: JobCardAction;
  onChange: (action: JobCardAction) => void;
  color: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
}) {
  return (
    <>
      <div className="lw-jobs-settings__group" role="radiogroup" aria-label={label}>
        <span className="lw-jobs-settings__group-label">{label}</span>
        {ACTIONS.map((action) => (
          <label key={action} className="lw-jobs-settings__radio">
            <input type="radio" name={name} checked={value === action} onChange={() => onChange(action)} />
            {ACTION_LABELS[action]}
          </label>
        ))}
      </div>
      {value === "highlight" && <HighlightColorPicker label={colorLabel} color={color} onChange={onColorChange} />}
    </>
  );
}

export function JobsSettingsSection({ settings, onChange }: JobsSettingsSectionProps) {
  return (
    <div className="lw-jobs-settings">
      <span className="lw-jobs-settings__title">Jobs</span>
      <ActionRadioGroup
        name="lw-applied-action"
        label="Applied jobs"
        value={settings.appliedAction}
        onChange={(appliedAction) => onChange({ ...settings, appliedAction })}
        color={settings.appliedColor}
        onColorChange={(appliedColor) => onChange({ ...settings, appliedColor })}
      />
      <ActionRadioGroup
        name="lw-viewed-action"
        label="Viewed jobs"
        value={settings.viewedAction}
        onChange={(viewedAction) => onChange({ ...settings, viewedAction })}
        color={settings.viewedColor}
        onColorChange={(viewedColor) => onChange({ ...settings, viewedColor })}
      />
      <ActionRadioGroup
        name="lw-saved-action"
        label="Saved jobs"
        value={settings.savedAction}
        onChange={(savedAction) => onChange({ ...settings, savedAction })}
        color={settings.savedColor}
        onColorChange={(savedColor) => onChange({ ...settings, savedColor })}
      />
      <label className="lw-jobs-settings__keywords-label">
        Keyword filters
        <textarea
          className="lw-jobs-settings__keywords-input"
          value={settings.keywordsText}
          onChange={(e) => onChange({ ...settings, keywordsText: e.target.value })}
          placeholder="Promoted, On-site, Senior"
        />
      </label>
      <ActionRadioGroup
        name="lw-keyword-action"
        label="Keyword action"
        value={settings.keywordAction}
        onChange={(keywordAction) => onChange({ ...settings, keywordAction })}
        color={settings.keywordColor}
        colorLabel="Keyword filter color"
        onColorChange={(keywordColor) => onChange({ ...settings, keywordColor })}
      />
      <label className="lw-jobs-settings__checkbox">
        <input
          type="checkbox"
          checked={settings.caseInsensitive}
          onChange={(e) => onChange({ ...settings, caseInsensitive: e.target.checked })}
        />
        Case-insensitive matching
      </label>
    </div>
  );
}
