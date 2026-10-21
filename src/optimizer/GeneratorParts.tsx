import type { ReactNode } from "react";
import { NavSquare } from "./SectionPages";

// The pieces both writing tools share, so Headline and About look and behave identically.

// Same rounded-square back button as the optimizer section pages, with the tool's name centered.
export function GeneratorNav({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  return (
    <nav className="lw-od-nav lw-gen-nav" aria-label={title}>
      <NavSquare label={backLabel} onClick={onBack}>
        <path d="M19 12H5m6-6-6 6 6 6" />
      </NavSquare>
      <span className="lw-od-nav__center">
        <span className="lw-od-nav__title">
          <span className="lw-od-nav__name">{title}</span>
        </span>
      </span>
      <span className="lw-gen-nav__spacer" aria-hidden="true" />
    </nav>
  );
}

export function GeneratorBlock({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="lw-gen-block" aria-label={title}>
      <div className="lw-gen-block__head">
        <h4 className="lw-opt-group__title">{title}</h4>
        {action}
      </div>
      <div className="lw-opt-block-card lw-gen-card">{children}</div>
    </section>
  );
}

export function CurrentCard({ text, empty }: { text: string; empty: string }) {
  return text.trim() ? <p className="lw-gen-current">{text}</p> : <p className="lw-gen-current is-empty">{empty}</p>;
}

export function PrimaryButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="lw-primary-button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
