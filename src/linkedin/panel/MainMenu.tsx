import type { ReactNode } from "react";
import { panelToolPreference, type PanelTool } from "../../optimizer/optimizerPreferences";
import { leaveSettings, openSettings } from "./settingsNav";

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

// A tool's top: the way back to the menu, then its name.
export function ToolHead({ title }: { title: string }) {
  return (
    <div className="lw-tool-head">
      <BackLink label="Back to Menu" onClick={() => panelToolPreference.set("menu")} />
      <h2 className="lw-tool-head__title">{title}</h2>
    </div>
  );
}

// Image-based heroes: the artwork carries the title and the buttons, and each drawn button gets an
// invisible hit area positioned in percentages (see panelStyles) so it tracks the image's scale.
interface ArtworkHotspot {
  label: string;
  modifier: string;
  onClick: () => void;
}

function ArtworkHero({ name, path, width, height, alt, hotspots, children }: { name: string; path: string; width: number; height: number; alt: string; hotspots: ArtworkHotspot[]; children?: ReactNode }) {
  const src = typeof chrome !== "undefined" ? chrome.runtime?.getURL?.(path) : undefined;
  return (
    <section className={`lw-art-hero lw-art-hero--${name}`}>
      <img className="lw-art-hero__art" src={src || undefined} width={width} height={height} alt={alt} draggable={false} />
      {children}
      {hotspots.map((hotspot) => (
        <button key={hotspot.modifier} type="button" className={`lw-art-hero__hotspot lw-art-hero__hotspot--${hotspot.modifier}`} aria-label={hotspot.label} onClick={hotspot.onClick} />
      ))}
    </section>
  );
}

export function AnalyzerHero() {
  return (
    <ArtworkHero
      name="analyzer"
      path="content/assets/profile-analyzer-hero.webp"
      width={1672}
      height={941}
      alt="Profile Analyzer. Get insights and actionable tips for any LinkedIn profile."
      hotspots={[
        { label: "Open LinkWise menu", modifier: "menu", onClick: () => panelToolPreference.set("menu") },
        { label: "Open LinkWise settings", modifier: "settings", onClick: openSettings },
      ]}
    />
  );
}

// The Optimizer artwork draws the menu and settings buttons but no words; the title and subtitle
// are live text laid over its empty left side.
export function OptimizerHero() {
  return (
    <ArtworkHero
      name="optimizer"
      path="content/assets/profile-optimizer-hero.webp"
      width={1689}
      height={1060}
      alt=""
      hotspots={[
        { label: "Open LinkWise menu", modifier: "menu", onClick: () => panelToolPreference.set("menu") },
        { label: "Open LinkWise settings", modifier: "settings", onClick: openSettings },
      ]}
    >
      <div className="lw-art-hero__copy">
        <h2 className="lw-art-hero__title">Profile Optimizer</h2>
        <p className="lw-art-hero__subtitle">
          <span>Improve your LinkedIn profile</span> <span>with AI-powered suggestions.</span>
        </p>
      </div>
    </ArtworkHero>
  );
}

export function SettingsHero() {
  return (
    <ArtworkHero
      name="settings"
      path="content/assets/settings-hero.webp"
      width={1672}
      height={941}
      alt=""
      hotspots={[
        { label: "Go back", modifier: "back", onClick: leaveSettings },
        { label: "Open LinkWise menu", modifier: "menu", onClick: () => panelToolPreference.set("menu") },
      ]}
    >
      <div className="lw-art-hero__copy">
        <h2 className="lw-art-hero__title">Settings</h2>
        <p className="lw-art-hero__subtitle">Customize scanning, highlights, and preferences.</p>
      </div>
    </ArtworkHero>
  );
}
