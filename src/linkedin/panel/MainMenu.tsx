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

// The LinkWise mark: three rising bars wrapped by a signal orbit, with a small spark. Drawn on its
// own dark tile so the gradient reads on any header color, and kept simple enough for 16px.
export function BrandMark() {
  return (
    <svg className="lw-panel__mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lw-mark-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b2f8f" />
          <stop offset="1" stopColor="#0e1a5c" />
        </linearGradient>
        <linearGradient id="lw-mark-bars" gradientUnits="userSpaceOnUse" x1="0" y1="25" x2="0" y2="7">
          <stop offset="0" stopColor="#3478f6" />
          <stop offset="0.55" stopColor="#7d8cff" />
          <stop offset="1" stopColor="#d4ccff" />
        </linearGradient>
        <linearGradient id="lw-mark-orbit" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="28" y2="0">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#3f86f8" />
          <stop offset="1" stopColor="#7c5cfc" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="url(#lw-mark-tile)" stroke="#9db8ff" strokeOpacity="0.32" />
      <g fill="url(#lw-mark-bars)">
        <rect x="9" y="16.5" width="4" height="8.5" rx="2" />
        <rect x="14.25" y="12" width="4" height="13" rx="2" />
        <rect x="19.5" y="7.5" width="4" height="17.5" rx="2" />
      </g>
      <path d="M5.2 21.6c-.9 3.4 4.9 5.2 11.3 4 5.2-1 9.4-3.6 11-7" fill="none" stroke="url(#lw-mark-orbit)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M26.2 4.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#e4dfff" />
    </svg>
  );
}

// The brand bar's two faint signal paths, stretched to whatever size the bar is.
export function HeaderSignalLines() {
  return (
    <svg className="lw-panel__lines" viewBox="0 0 360 62" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="lw-line-main" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4d8dff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#5f9dff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#a58bff" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="lw-line-cross" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6f8dff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#8a78ff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#9a6dff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M95 64C170 40 260 22 362 19" fill="none" stroke="url(#lw-line-main)" strokeWidth="4" strokeOpacity="0.22" />
      <path d="M95 64C170 40 260 22 362 19" fill="none" stroke="url(#lw-line-main)" strokeWidth="0.9" />
      <path d="M150 30C215 34 268 46 300 64" fill="none" stroke="url(#lw-line-cross)" strokeWidth="0.8" />
    </svg>
  );
}

const ICON_PROPS = { viewBox: "0 0 24 24", width: 22, height: 22, fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

// The hero's top row: the main menu on the left, Settings on the right.
export function HeroNav({ showSettings = false }: { showSettings?: boolean }) {
  return (
    <div className="lw-hero-nav">
      <button type="button" className="lw-hero-nav__button lw-hero-nav__button--menu" aria-label="Open LinkWise menu" title="Menu" onClick={() => panelToolPreference.set("menu")}>
        <svg {...ICON_PROPS} stroke="url(#lw-menu-lines)">
          <defs>
            <linearGradient id="lw-menu-lines" gradientUnits="userSpaceOnUse" x1="5" y1="0" x2="19" y2="0">
              <stop offset="0" stopColor="#4f7cf6" />
              <stop offset="1" stopColor="#7458f5" />
            </linearGradient>
          </defs>
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
