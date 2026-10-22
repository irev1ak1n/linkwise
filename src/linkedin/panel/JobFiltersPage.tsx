import { useState } from "react";
import type { JobCardAction, JobsSettings } from "../../models/jobsSettings";
import type { HighlightColor } from "../highlightPalette";
import { parseKeywords } from "../jobs/keywordMatcher";
import { HighlightColorPicker } from "./HighlightColorPicker";
import { JobAnalyzerTab } from "./JobAnalyzerTab";
import { isJobsSearchPage } from "../jobs/jobsRuntime";

interface JobFiltersPageProps {
  settings: JobsSettings;
  onChange: (settings: JobsSettings) => void;
  onBack: () => void;
}

const ACTION_LABELS: Record<JobCardAction, string> = {
  none: "Do nothing",
  hide: "Hide",
  highlight: "Highlight",
};

const ACTIONS: JobCardAction[] = ["none", "hide", "highlight"];

type StatusKey = "applied" | "viewed" | "saved";
const STATUSES: { key: StatusKey; label: string }[] = [
  { key: "applied", label: "Applied jobs" },
  { key: "viewed", label: "Viewed jobs" },
  { key: "saved", label: "Saved jobs" },
];

// The color choice only appears while the rule actually highlights.
function ActionRule({
  label,
  value,
  onChange,
  color,
  onColorChange,
  colorLabel = `${label} color`,
}: {
  label: string;
  colorLabel?: string;
  value: JobCardAction;
  onChange: (action: JobCardAction) => void;
  color: HighlightColor;
  onColorChange: (color: HighlightColor) => void;
}) {
  return (
    <div className="lw-job-rule">
      <span className="lw-job-rule__label">{label}</span>
      <div className="lw-scan-mode__control" role="radiogroup" aria-label={label}>
        {ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            role="radio"
            aria-checked={value === action}
            className={`lw-scan-mode__option${value === action ? " is-active" : ""}`}
            onClick={() => onChange(action)}
          >
            {ACTION_LABELS[action]}
          </button>
        ))}
      </div>
      {value === "highlight" && <HighlightColorPicker label={colorLabel} color={color} onChange={onColorChange} />}
    </div>
  );
}

export function activeJobRules(settings: JobsSettings): string[] {
  const rules: string[] = [];
  for (const { key, label } of STATUSES) {
    const action = settings[`${key}Action`];
    if (action !== "none") rules.push(`${ACTION_LABELS[action]} ${label.toLowerCase()}`);
  }
  const keywords = parseKeywords(settings.keywordsText);
  if (settings.keywordAction !== "none" && keywords.length > 0) {
    rules.push(`${ACTION_LABELS[settings.keywordAction]} jobs containing ${keywords.map((k) => `"${k}"`).join(", ")}`);
  }
  return rules;
}

type JobsTab = "analyzer" | "filters";
const TABS: { key: JobsTab; label: string }[] = [
  { key: "analyzer", label: "Job Analyzer" },
  { key: "filters", label: "Filters" },
];

// Analyzing is what you want while a job is open; the filter settings are what you want otherwise.
const onJobPage = () => typeof location !== "undefined" && (isJobsSearchPage(location.href) || /\/jobs\/view\//.test(location.href));

export function JobFiltersPage({ settings, onChange, onBack }: JobFiltersPageProps) {
  const [tab, setTab] = useState<JobsTab>(() => (onJobPage() ? "analyzer" : "filters"));
  const rules = activeJobRules(settings);
  return (
    <div className="lw-jobs-page">
      <button type="button" className="lw-opt-back" onClick={onBack}>
        ← Back to Menu
      </button>
      <div className="lw-scan-mode__control" role="tablist" aria-label="Jobs">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`lw-scan-mode__option${tab === key ? " is-active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "analyzer" ? (
        <JobAnalyzerTab />
      ) : (
        <>
      <div>
        <h3 className="lw-opt-page__title">Job Filters</h3>
        <p className="lw-scan-mode__hint">Customize how LinkedIn job listings are hidden or highlighted.</p>
      </div>

      <section className="lw-opt-block">
        <h4>Job status</h4>
        {STATUSES.map(({ key, label }) => (
          <ActionRule
            key={key}
            label={label}
            value={settings[`${key}Action`]}
            onChange={(action) => onChange({ ...settings, [`${key}Action`]: action })}
            color={settings[`${key}Color`]}
            onColorChange={(color) => onChange({ ...settings, [`${key}Color`]: color })}
          />
        ))}
      </section>

      <section className="lw-opt-block">
        <h4>Keyword filters</h4>
        <textarea
          className="lw-keywords__input"
          aria-label="Keyword filters"
          rows={3}
          value={settings.keywordsText}
          onChange={(e) => onChange({ ...settings, keywordsText: e.target.value })}
          placeholder="Promoted, On-site, Senior"
        />
        <p className="lw-scan-mode__hint">Separate keywords with commas or new lines.</p>
        <ActionRule
          label="Action"
          colorLabel="Keyword filter color"
          value={settings.keywordAction}
          onChange={(keywordAction) => onChange({ ...settings, keywordAction })}
          color={settings.keywordColor}
          onColorChange={(keywordColor) => onChange({ ...settings, keywordColor })}
        />
        <label className="lw-expand-details">
          <input type="checkbox" checked={settings.caseInsensitive} onChange={(e) => onChange({ ...settings, caseInsensitive: e.target.checked })} />
          Case-insensitive matching
        </label>
      </section>

      {rules.length > 0 && (
        <section className="lw-opt-block">
          <h4>Active filters</h4>
          <ul className="lw-opt-tips">
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      )}
        </>
      )}
    </div>
  );
}
