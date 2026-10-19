import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { parseKeywords } from "../keywordHighlights";
import { HIGHLIGHT_SHADES, PROFILE_HIGHLIGHT_COLORS, type HighlightColor } from "../highlightPalette";
import {
  CATEGORY_INFO,
  HIGHLIGHT_CATEGORIES,
  KEYWORDS_INFO,
  resetHighlightStyles,
  type HighlightCategory,
  type HighlightStyle,
} from "../../signals/highlightCategories";
import { highlightPreferences } from "./highlightPreferences";

export const HIGHLIGHT_TEXT_MAX_LENGTH = 500;

// The highlighter matches case-insensitively and ignores repeats and order, so only a change to
// that set is a real edit.
export function keywordSetKey(text: string): string {
  return [...new Set(parseKeywords(text).map((keyword) => keyword.toLowerCase()))].sort().join("\n");
}

type RuleId = HighlightCategory | "keywords";

const ICON_PATHS: Record<RuleId, ReactNode> = {
  roles: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
  numbers: <path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16" />,
  impact: <path d="m3 17 6-6 4 4 8-8m0 0h-5m5 0v5" />,
  leadership: <path d="M5 21V4m0 0h11l-2 4 2 4H5" />,
  skills: <path d="m8 9-4 3 4 3m8-6 4 3-4 3M14 5l-4 14" />,
  achievements: <path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v4m-4 3h8" />,
  projects: <path d="M4 8h16v11H4zM9 8V5h6v3" />,
  languages: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" />,
  keywords: <path d="M14.5 13a4.5 4.5 0 1 0-4.2-2.9L4 16.4V20h3.6l1-1v-2h2v-2h2l.9-.9c.3.1.7.1 1 .1Z" />,
};

function RuleIcon({ id }: { id: RuleId }) {
  return (
    <svg
      className="lw-rule__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[id]}
    </svg>
  );
}

const infoFor = (id: RuleId) => (id === "keywords" ? KEYWORDS_INFO : CATEGORY_INFO[id]);

function Swatches({ color, onChange, label }: { color: HighlightColor; onChange: (color: HighlightColor) => void; label: string }) {
  return (
    <div className="lw-swatches" role="radiogroup" aria-label={label}>
      {PROFILE_HIGHLIGHT_COLORS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === color}
          aria-label={HIGHLIGHT_SHADES[option].label}
          title={HIGHLIGHT_SHADES[option].label}
          className={option === color ? "lw-swatch lw-swatch--selected" : "lw-swatch"}
          style={{ backgroundColor: HIGHLIGHT_SHADES[option].swatch }}
          onClick={() => onChange(option)}
        />
      ))}
    </div>
  );
}

// The color dot opens a small palette in place, closed by a pick, a click elsewhere, or Escape.
function ColorDot({ name, color, onChange, disabled }: { name: string; color: HighlightColor; onChange: (color: HighlightColor) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: Event) => {
      if (ref.current && !event.composedPath().includes(ref.current)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <span className="lw-dot" ref={ref}>
      <button
        type="button"
        className="lw-dot__button"
        aria-label={`${name} color: ${HIGHLIGHT_SHADES[color].label}`}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        style={{ backgroundColor: HIGHLIGHT_SHADES[color].swatch }}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <span className="lw-dot__popover">
          <Swatches
            label={`${name} color`}
            color={color}
            onChange={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        </span>
      )}
    </span>
  );
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="lw-switch"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function RuleRow({
  id,
  rule,
  onOpen,
  onChange,
  disabled,
}: {
  id: RuleId;
  rule: HighlightStyle;
  onOpen: () => void;
  onChange: (patch: Partial<HighlightStyle>) => void;
  disabled?: boolean;
}) {
  const { label } = infoFor(id);
  return (
    <li className={disabled ? "lw-rule lw-rule--disabled" : "lw-rule"}>
      <button type="button" className="lw-rule__name" onClick={onOpen} disabled={disabled}>
        <RuleIcon id={id} />
        <span>{label}</span>
      </button>
      <ColorDot name={label} color={rule.color} disabled={disabled} onChange={(color) => onChange({ color })} />
      <span className="lw-rule__divider" aria-hidden="true" />
      <Switch label={`Highlight ${label}`} checked={rule.enabled} disabled={disabled} onChange={(enabled) => onChange({ enabled })} />
      <button type="button" className="lw-rule__more" aria-label={`${label} settings`} onClick={onOpen} disabled={disabled}>
        ›
      </button>
    </li>
  );
}

function Preview({ text, rule, dotted }: { text: string; rule: HighlightStyle; dotted?: boolean }) {
  const { fill, mark } = HIGHLIGHT_SHADES[rule.color];
  const underline = rule.underline ? { textDecoration: `underline ${dotted ? "dotted " : ""}2px ${mark}`, textUnderlineOffset: "3px" } : {};
  return (
    <div className="lw-rule-detail__field">
      <span className="lw-rule-detail__label">Preview</span>
      <span className="lw-rule-detail__preview" style={{ backgroundColor: fill, ...underline }}>
        {text}
      </span>
    </div>
  );
}

function KeywordsEditor({ keywords, onSave, onCancel }: { keywords: string; onSave: (keywords: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(keywords);
  useEffect(() => setDraft(keywords), [keywords]);
  const unchanged = keywordSetKey(draft) === keywordSetKey(keywords);
  return (
    <div className="lw-rule-detail__field lw-keywords-editor">
      <textarea
        className="text-area"
        rows={3}
        aria-label="Keywords"
        maxLength={HIGHLIGHT_TEXT_MAX_LENGTH}
        value={draft}
        spellCheck={false}
        placeholder="Python, robotics, volunteer"
        onChange={(e) => setDraft(e.target.value.slice(0, HIGHLIGHT_TEXT_MAX_LENGTH))}
      />
      <div className="lw-goal__footer">
        <span className="char-count">
          {draft.length} / {HIGHLIGHT_TEXT_MAX_LENGTH}
        </span>
        <div className="lw-goal__actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              setDraft(keywords);
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={unchanged}
            title={unchanged ? "Change the keywords to save" : undefined}
            onClick={() => onSave(draft.trim())}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RuleDetail({
  id,
  rule,
  onChange,
  onBack,
  keywords,
  onKeywordsSave,
}: {
  id: RuleId;
  rule: HighlightStyle;
  onChange: (patch: Partial<HighlightStyle>) => void;
  onBack: () => void;
  keywords: string;
  onKeywordsSave: (keywords: string) => void;
}) {
  const { label, description, preview } = infoFor(id);
  const sample = id === "keywords" ? (parseKeywords(keywords)[0] ?? preview) : preview;
  return (
    <section className="lw-rule-detail" aria-label={`${label} highlighting`}>
      <button type="button" className="lw-opt-back" onClick={onBack}>
        ← Highlighting
      </button>
      <h3 className="lw-rule-detail__title">
        <RuleIcon id={id} />
        {label}
      </h3>
      <p className="lw-rule-detail__description">{description}</p>
      {id === "keywords" && <KeywordsEditor keywords={keywords} onSave={onKeywordsSave} onCancel={onBack} />}
      <label className="lw-rule-detail__row">
        <span>Enabled</span>
        <Switch label={`Highlight ${label}`} checked={rule.enabled} onChange={(enabled) => onChange({ enabled })} />
      </label>
      <div className="lw-rule-detail__field">
        <span className="lw-rule-detail__label">Highlight color</span>
        <Swatches label={`${label} color`} color={rule.color} onChange={(color) => onChange({ color })} />
      </div>
      <label className="lw-rule-detail__row">
        <span>Underline text</span>
        <Switch label={`Underline ${label}`} checked={rule.underline} onChange={(underline) => onChange({ underline })} />
      </label>
      <Preview text={sample} rule={rule} dotted={id === "keywords"} />
    </section>
  );
}

interface HighlightSettingsProps {
  signalEnabled: boolean;
  highlighted: number;
  onSignalChange: (enabled: boolean) => void;
  keywords: string;
  onKeywordsSave: (keywords: string) => void;
  /** Opens a rule's details first; only for tests. */
  initialDetail?: RuleId | null;
}

// How highlighting looks on the LinkedIn page. Signal Mode decides what is worth highlighting;
// each category only decides how that evidence is drawn, and Keywords are the user's own terms.
export function HighlightSettings({ signalEnabled, highlighted, onSignalChange, keywords, onKeywordsSave, initialDetail = null }: HighlightSettingsProps) {
  highlightPreferences.init();
  const { value: prefs } = useSyncExternalStore(highlightPreferences.subscribe, highlightPreferences.getState, highlightPreferences.getState);
  const [detail, setDetail] = useState<RuleId | null>(initialDetail);
  // Switching between the list and a rule's page keeps the top of the new view in sight.
  const sectionRef = useRef<HTMLElement>(null);
  const switched = useRef(false);
  useEffect(() => {
    if (!switched.current) {
      switched.current = true;
      return;
    }
    sectionRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [detail]);
  const ruleFor = (id: RuleId) => (id === "keywords" ? prefs.keywords : prefs.categories[id]);
  const change = (id: RuleId) => (patch: Partial<HighlightStyle>) =>
    id === "keywords" ? highlightPreferences.setKeywords(patch) : highlightPreferences.setCategory(id, patch);

  if (detail) {
    return (
      <section className="lw-hl lw-highlighting" aria-label="Profile highlights" ref={sectionRef}>
        <RuleDetail
          id={detail}
          rule={ruleFor(detail)}
          onChange={change(detail)}
          onBack={() => setDetail(null)}
          keywords={keywords}
          onKeywordsSave={onKeywordsSave}
        />
      </section>
    );
  }

  return (
    <section className="lw-hl lw-highlighting" aria-label="Profile highlights" ref={sectionRef}>
      <h3 className="lw-an-heading">Profile highlights</h3>
      <label className="lw-rule lw-rule--master">
        <span className="lw-rule__name lw-rule__name--static">
          <span>Signal Mode</span>
          {signalEnabled && highlighted > 0 && <span className="lw-rule__count">{highlighted} highlighted</span>}
        </span>
        <Switch label="Signal Mode" checked={signalEnabled} onChange={onSignalChange} />
      </label>
      <h4 className="lw-rules__label">Auto categories</h4>
      <ul className="lw-rules" aria-label="Auto categories">
        {HIGHLIGHT_CATEGORIES.map((id) => (
          <RuleRow key={id} id={id} rule={prefs.categories[id]} onOpen={() => setDetail(id)} onChange={change(id)} disabled={!signalEnabled} />
        ))}
      </ul>
      <h4 className="lw-rules__label">Custom rules</h4>
      <ul className="lw-rules" aria-label="Custom rules">
        <RuleRow id="keywords" rule={prefs.keywords} onOpen={() => setDetail("keywords")} onChange={change("keywords")} />
      </ul>
      <button type="button" className="lw-rules__reset" onClick={() => highlightPreferences.set({ ...resetHighlightStyles() })}>
        Reset highlight styles
      </button>
    </section>
  );
}
