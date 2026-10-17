import type { ReactNode } from "react";
import { panelToolPreference, type PanelTool } from "../../optimizer/optimizerPreferences";

type MenuTool = Exclude<PanelTool, "menu">;

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

// A tool's top: the way back to the menu, then its name.
export function ToolHead({ title }: { title: string }) {
  return (
    <div className="lw-tool-head">
      <BackLink label="Back to Menu" onClick={() => panelToolPreference.set("menu")} />
      <h2 className="lw-tool-head__title">{title}</h2>
    </div>
  );
}
