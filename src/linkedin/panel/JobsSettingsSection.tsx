import type { JobCardAction, JobsSettings } from "../../models/jobsSettings";

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

function ActionRadioGroup({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: JobCardAction;
  onChange: (action: JobCardAction) => void;
}) {
  return (
    <div className="lw-jobs-settings__group" role="radiogroup" aria-label={label}>
      <span className="lw-jobs-settings__group-label">{label}</span>
      {ACTIONS.map((action) => (
        <label key={action} className="lw-jobs-settings__radio">
          <input type="radio" name={name} checked={value === action} onChange={() => onChange(action)} />
          {ACTION_LABELS[action]}
        </label>
      ))}
    </div>
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
      />
      <ActionRadioGroup
        name="lw-viewed-action"
        label="Viewed jobs"
        value={settings.viewedAction}
        onChange={(viewedAction) => onChange({ ...settings, viewedAction })}
      />
      <ActionRadioGroup
        name="lw-saved-action"
        label="Saved jobs"
        value={settings.savedAction}
        onChange={(savedAction) => onChange({ ...settings, savedAction })}
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
