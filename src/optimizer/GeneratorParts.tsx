import { useLayoutEffect, useRef, type ReactNode } from "react";
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

const MAX_FIELD_HEIGHT = 240;

// The one steering box both tools share: the same title, help line, and textarea. It grows with its
// text instead of showing a scrollbar, and only scrolls past a comfortable height.
export function IncludeField({ help, placeholder, value, onChange }: { help: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, MAX_FIELD_HEIGHT)}px`;
    field.style.overflowY = field.scrollHeight > MAX_FIELD_HEIGHT ? "auto" : "hidden";
  }, [value]);
  return (
    <GeneratorBlock title="What should we include?">
      <p className="lw-gen-help">{help}</p>
      <textarea ref={ref} className="lw-gen-input lw-gen-input--area" rows={3} aria-label="What should we include?" value={value} maxLength={600} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </GeneratorBlock>
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
