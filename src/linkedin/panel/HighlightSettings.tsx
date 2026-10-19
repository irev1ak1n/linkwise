import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { parseKeywords } from "../keywordHighlights";
import { editableColor, HIGHLIGHT_SHADES, PROFILE_HIGHLIGHT_COLORS, shadeFor, type HighlightColor } from "../highlightPalette";
import {
  CATEGORY_INFO,
  HIGHLIGHT_CATEGORIES,
  KEYWORDS_INFO,
  resetHighlightStyles,
  type HighlightStyle,
} from "../../signals/highlightCategories";
import { highlightPreferences, MAX_RECENT_COLORS, recentHighlightColors, rememberRecentColor } from "./highlightPreferences";
import { HighlightColorEditor } from "./HighlightColorEditor";
import { HighlightPreviewCards } from "./HighlightPreviewCards";
import { HighlightStylePicker } from "./HighlightStylePicker";
import { panelToolPreference } from "../../optimizer/optimizerPreferences";
import { closeHighlightRule, getHighlightRule, openHighlightRule, subscribeHighlightRule, takeListScroll, type HighlightRuleId } from "./settingsNav";

export const HIGHLIGHT_TEXT_MAX_LENGTH = 500;

// The highlighter matches case-insensitively and ignores repeats and order, so only a change to
// that set is a real edit.
export function keywordSetKey(text: string): string {
  return [...new Set(parseKeywords(text).map((keyword) => keyword.toLowerCase()))].sort().join("\n");
}

type RuleId = HighlightRuleId;

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

function Swatches({ color, onChange, label }: { color: HighlightColor | null; onChange: (color: HighlightColor) => void; label: string }) {
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
function ColorDot({ name, rule, onChange, disabled }: { name: string; rule: HighlightStyle; onChange: (color: HighlightColor) => void; disabled?: boolean }) {
  const shade = shadeFor(rule);
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
        aria-label={`${name} color: ${shade.label}`}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        style={{ backgroundColor: shade.swatch }}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <span className="lw-dot__popover">
          <Swatches
            label={`${name} color`}
            color={rule.custom ? null : rule.color}
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
  // While Signal Mode is off its categories are greyed out and their quick controls rest, but
  // every row still opens its full editor: a style can be set up before it is ever shown.
  return (
    // The whole row opens the editor; the color dot and the switch keep their own clicks.
    <li
      className={disabled ? "lw-rule lw-rule--row lw-rule--disabled" : "lw-rule lw-rule--row"}
      onClick={(event) => {
        if (!(event.target as Element).closest(".lw-dot, .lw-switch, button")) onOpen();
      }}
    >
      <button type="button" className="lw-rule__name" onClick={onOpen}>
        <span className="lw-rule__tile" aria-hidden="true">
          <RuleIcon id={id} />
        </span>
        <span>{label}</span>
      </button>
      <ColorDot name={label} rule={rule} disabled={disabled} onChange={(color) => onChange({ color, custom: undefined })} />
      <span className="lw-rule__divider" aria-hidden="true" />
      <Switch label={`Highlight ${label}`} checked={rule.enabled} disabled={disabled} onChange={(enabled) => onChange({ enabled })} />
      <button type="button" className="lw-rule__more" aria-label={`${label} settings`} onClick={onOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </li>
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

// Back and Menu share one compact control; only the icon differs.
function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="lw-nav-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

// The card art, sparkle tile included, is one image; the title, live count, description, and
// switch are real interface layered over it, placed beside the tile the art already draws.
const SMART_HIGHLIGHTS_ART = "content/assets/smart-highlights-card.webp";

// Smart Highlights (Signal Mode in the code) is the switch above every category: it decides
// whether the page is highlighted at all. Only the switch toggles it; the card around it is
// display, so a stray click never turns highlighting off.
function SmartHighlightsCard({ enabled, highlighted, onChange }: { enabled: boolean; highlighted: number; onChange: (enabled: boolean) => void }) {
  const art = typeof chrome !== "undefined" ? chrome.runtime?.getURL?.(SMART_HIGHLIGHTS_ART) : undefined;
  return (
    <div className={enabled ? "lw-sh" : "lw-sh lw-sh--off"} role="group" aria-label="Smart Highlights">
      <img className="lw-sh__art" src={art || undefined} width={1676} height={713} alt="" draggable={false} />
      <div className="lw-sh__content">
        <span className="lw-sh__text">
          <span className="lw-sh__title">Smart Highlights</span>
          <span className="lw-sh__count">{enabled ? `${highlighted} highlighted` : "Off"}</span>
        </span>
        <input type="checkbox" role="switch" className="lw-sh__switch" aria-label="Smart Highlights" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
        <p className="lw-sh__description">Automatically highlight the most important details as you browse.</p>
      </div>
    </div>
  );
}

// The one editor every highlight rule opens: the eight automatic categories and Keywords get the
// same page, which differs only by the rule's name, icon, and stored style (plus, for Keywords,
// the words themselves).
function HighlightCategoryEditor({
  id,
  rule,
  onChange,
  onBack,
  keywords,
  onKeywordsSave,
}: {
  id: RuleId;
  rule: HighlightStyle;
  onChange: (patch: Partial<HighlightStyle>, live?: boolean) => void;
  onBack: () => void;
  keywords: string;
  onKeywordsSave: (keywords: string) => void;
}) {
  const { label } = infoFor(id);
  recentHighlightColors.init();
  const { value: recent } = useSyncExternalStore(recentHighlightColors.subscribe, recentHighlightColors.getState, recentHighlightColors.getState);
  return (
    <section className="lw-rule-detail" aria-label={`${label} highlighting`}>
      <header className="lw-rule-detail__head">
        <span className="lw-rule-detail__nav">
          <NavButton label="Back to highlighting" onClick={onBack}>
            <path d="M19 12H5m6-6-6 6 6 6" />
          </NavButton>
          <NavButton label="Open LinkWise menu" onClick={() => panelToolPreference.set("menu")}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </NavButton>
        </span>
        <h3 className="lw-rule-detail__title">
          <RuleIcon id={id} />
          <span>{label}</span>
        </h3>
        <Switch label={`Highlight ${label}`} checked={rule.enabled} onChange={(enabled) => onChange({ enabled })} />
      </header>
      {id === "keywords" && (
        <section className="lw-rule-detail__words" aria-label="Custom words">
          <h4 className="lw-ce__heading">Custom Words</h4>
          <KeywordsEditor keywords={keywords} onSave={onKeywordsSave} onCancel={onBack} />
        </section>
      )}
      <HighlightColorEditor
        name={label}
        value={editableColor(rule)}
        onChange={(custom, live) => onChange({ custom }, live)}
        recent={recent.length > 0 ? recent : QUICK_COLORS}
        onSettle={rememberRecentColor}
      />
      <HighlightStylePicker name={label} style={rule} onChange={(look) => onChange({ look })} />
      <HighlightPreviewCards id={id} rule={rule} />
    </section>
  );
}

// Until the user has picked colors of their own, Recent Colors offers LinkWise's presets.
const QUICK_COLORS = PROFILE_HIGHLIGHT_COLORS.slice(0, MAX_RECENT_COLORS).map((color) => editableColor({ color }).hex);

interface HighlightSettingsProps {
  signalEnabled: boolean;
  highlighted: number;
  onSignalChange: (enabled: boolean) => void;
  keywords: string;
  onKeywordsSave: (keywords: string) => void;
}

// How highlighting looks on the LinkedIn page. Signal Mode decides what is worth highlighting;
// each category only decides how that evidence is drawn, and Keywords are the user's own terms.
export function HighlightSettings({ signalEnabled, highlighted, onSignalChange, keywords, onKeywordsSave }: HighlightSettingsProps) {
  highlightPreferences.init();
  const { value: prefs } = useSyncExternalStore(highlightPreferences.subscribe, highlightPreferences.getState, highlightPreferences.getState);
  const detail = useSyncExternalStore(subscribeHighlightRule, getHighlightRule, getHighlightRule);
  // A category's page starts at its top; Back returns to the list where it was left.
  const sectionRef = useRef<HTMLElement>(null);
  const scroller = () => sectionRef.current?.closest<HTMLElement>(".lw-panel__body") ?? null;
  useLayoutEffect(() => {
    const body = scroller();
    const top = detail ? 0 : takeListScroll();
    if (body && top !== null) body.scrollTop = top;
  }, [detail]);
  const open = (id: RuleId) => openHighlightRule(id, scroller()?.scrollTop ?? 0);
  const back = closeHighlightRule;
  const ruleFor = (id: RuleId) => (id === "keywords" ? prefs.keywords : prefs.categories[id]);
  const change = (id: RuleId) => (patch: Partial<HighlightStyle>, live = false) =>
    id === "keywords" ? highlightPreferences.setKeywords(patch, live) : highlightPreferences.setCategory(id, patch, live);

  if (detail) {
    return (
      <section className="lw-highlighting" aria-label="Profile highlights" ref={sectionRef}>
        <HighlightCategoryEditor
          id={detail}
          rule={ruleFor(detail)}
          onChange={change(detail)}
          onBack={back}
          keywords={keywords}
          onKeywordsSave={onKeywordsSave}
        />
      </section>
    );
  }

  return (
    <section className="lw-hl lw-highlighting" aria-label="Profile highlights" ref={sectionRef}>
      <h3 className="lw-an-heading">Profile highlights</h3>
      <SmartHighlightsCard enabled={signalEnabled} highlighted={highlighted} onChange={onSignalChange} />
      {/* One grouped list: the automatic categories, then the user's own Keywords. Keywords keep
          their own rules (and stay usable without Signal Mode); only the grouping is shared. */}
      <h4 className="lw-rules__label">Highlight categories</h4>
      <ul className="lw-rules" aria-label="Highlight categories">
        {HIGHLIGHT_CATEGORIES.map((id) => (
          <RuleRow key={id} id={id} rule={prefs.categories[id]} onOpen={() => open(id)} onChange={change(id)} disabled={!signalEnabled} />
        ))}
        <RuleRow id="keywords" rule={prefs.keywords} onOpen={() => open("keywords")} onChange={change("keywords")} />
      </ul>
      <button type="button" className="lw-rules__reset" onClick={() => highlightPreferences.set({ ...resetHighlightStyles() })}>
        Reset highlight styles
      </button>
    </section>
  );
}
