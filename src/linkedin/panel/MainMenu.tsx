import type { ReactNode } from "react";
import { panelToolPreference, type PanelTool } from "../../optimizer/optimizerPreferences";

type MenuTool = Exclude<PanelTool, "menu" | "settings">;

const ICON: Record<MenuTool, ReactNode> = {
  analyzer: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  optimizer: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  jobs: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12h18" />
    </>
  ),
  saved: <path d="M6 4h12v16l-6-4-6 4z" />,
};

export const MENU_ITEMS: { tool: MenuTool; label: string; description: string }[] = [
  { tool: "analyzer", label: "Profile Analyzer", description: "Analyze someone's LinkedIn profile" },
  { tool: "optimizer", label: "Profile Optimizer", description: "Improve your own profile" },
  { tool: "jobs", label: "Job Filters", description: "Organize LinkedIn job listings" },
  { tool: "saved", label: "Saved Profiles", description: "Revisit profiles and track changes" },
];

// The only place the four tools are listed; every tool page leads back here.
export function MainMenu({ onOpen }: { onOpen: (tool: MenuTool) => void }) {
  return (
    <nav className="lw-menu" aria-label="LinkWise tools">
      {MENU_ITEMS.map((item) => (
        <button key={item.tool} type="button" className="lw-opt-card lw-menu__item" onClick={() => onOpen(item.tool)}>
          <svg className="lw-opt-card__icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICON[item.tool]}
          </svg>
          <span className="lw-opt-card__text">
            <span className="lw-opt-card__title">{item.label}</span>
            <span className="lw-opt-card__subtitle">{item.description}</span>
          </span>
          <span className="lw-opt-card__chevron" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </nav>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="lw-opt-back" onClick={onClick}>
      ← {label}
    </button>
  );
}

function AnalyzerHeroArt() {
  return (
    <div className="lw-tool-head__art" aria-hidden="true">
      <svg className="lw-tool-head__art-svg" viewBox="0 0 160 120">
        <g transform="rotate(7 104 57)">
          <rect x="55" y="14" width="94" height="82" rx="15" fill="#ffffff" fillOpacity="0.88" stroke="#dce8fb" strokeWidth="1.5" />
          <circle cx="81" cy="43" r="14" fill="#d9e8ff" />
          <circle cx="81" cy="39" r="6.5" fill="#6f9ff2" />
          <path d="M69 55c2.8-7 20.5-7 24 0v4H69z" fill="#6f9ff2" />
          <rect x="105" y="34" width="31" height="6.5" rx="3.25" fill="#c8d8f4" />
          <rect x="105" y="47" width="25" height="6.5" rx="3.25" fill="#d8e4f7" />
          <rect x="70" y="70" width="62" height="6.5" rx="3.25" fill="#d8e4f7" />
          <rect x="70" y="82" width="48" height="6.5" rx="3.25" fill="#e5edf9" />
        </g>
        <g transform="rotate(7 69 88)">
          <rect x="45" y="67" width="48" height="44" rx="11" fill="#ffffff" fillOpacity="0.94" stroke="#dce8fb" strokeWidth="1.5" />
          <rect x="57" y="91" width="6" height="9" rx="2" fill="#4f7fe0" />
          <rect x="67" y="84" width="6" height="16" rx="2" fill="#5c8bea" />
          <rect x="77" y="77" width="6" height="23" rx="2" fill="#70a2f4" />
        </g>
        <path d="M144 13l4-9M153 20l7-5" stroke="#5c8bea" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// The LinkWise "L" mark for the panel's branded top bar.
export function BrandMark() {
  return (
    <svg className="lw-panel__mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lw-mark-stem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fd0ff" />
          <stop offset="1" stopColor="#3b6cf0" />
        </linearGradient>
        <linearGradient id="lw-mark-foot" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2f5fe8" />
          <stop offset="1" stopColor="#8fc4ff" />
        </linearGradient>
      </defs>
      <path d="M13.5 4.5c1.6-1.9 4.6-1.3 5.4 1L13 21.5H8.4c-2.3 0-3.6-2.6-2.2-4.4z" fill="url(#lw-mark-stem)" />
      <rect x="5" y="19.5" width="23" height="8" rx="4" fill="url(#lw-mark-foot)" />
      <path d="M14.2 6.3c.6-.6 1.5-.5 1.9.1" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

const ICON_PROPS = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

// The hero's top row: the main menu on the left, Settings on the right.
export function HeroNav({ showSettings = false }: { showSettings?: boolean }) {
  return (
    <div className="lw-hero-nav">
      <button type="button" className="lw-hero-nav__button lw-hero-nav__button--menu" aria-label="Open LinkWise menu" title="Menu" onClick={() => panelToolPreference.set("menu")}>
        <svg {...ICON_PROPS}>
          <path d="M5 7h14M5 12h14M5 17h14" />
        </svg>
      </button>
      {showSettings && (
        <button type="button" className="lw-hero-nav__button lw-hero-nav__button--settings" aria-label="Open LinkWise settings" title="Settings" onClick={() => panelToolPreference.set("settings")}>
          <svg {...ICON_PROPS}>
            <path d="M10.3 3.6h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.7 1.6v1.9l1.7 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.7-1.6v-1.9L4.3 8.9 6 6l2.2.8 1.6-.9z" />
            <circle cx="12" cy="12" r="2.6" />
          </svg>
        </button>
      )}
    </div>
  );
}

// A tool's top: the way back to the menu, then its name.
export function ToolHead({ title, subtitle, decorated = false }: { title: string; subtitle?: string; decorated?: boolean }) {
  if (!decorated) {
    return (
      <div className="lw-tool-head">
        <BackLink label="Back to Menu" onClick={() => panelToolPreference.set("menu")} />
        <h2 className="lw-tool-head__title">{title}</h2>
      </div>
    );
  }

  return (
    <section className="lw-tool-head lw-tool-head--hero">
      <HeroNav showSettings />
      <div className="lw-tool-head__hero-row">
        <div className="lw-tool-head__copy">
          <h2 className="lw-tool-head__title">{title}</h2>
          {subtitle && <p className="lw-tool-head__subtitle">{subtitle}</p>}
        </div>
        <AnalyzerHeroArt />
      </div>
    </section>
  );
}
