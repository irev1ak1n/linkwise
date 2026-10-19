import type { ReactNode } from "react";

export type ScanOptionIcon = "expand" | "enhanced" | "sections";

const ICONS: Record<ScanOptionIcon, ReactNode> = {
  // A page with its text revealed.
  expand: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 15.5h6M10 19h3.5" />,
  // Sparkles: a deeper, smarter pass.
  enhanced: (
    <path d="M11 3.5c.5 4 2.2 6 6.2 6.6l1.6.3-1.6.3c-4 .7-5.7 2.6-6.2 6.6-.5-4-2.2-5.9-6.2-6.6L3.2 10.4l1.6-.3C8.8 9.5 10.5 7.5 11 3.5ZM18.5 15c.3 1.7.9 2.5 2.5 2.8l.6.1-.6.1c-1.6.3-2.2 1.1-2.5 2.8-.3-1.7-.9-2.5-2.5-2.8l-.6-.1.6-.1c1.6-.3 2.2-1.1 2.5-2.8Z" />
  ),
  // Stacked layers: the sections you open.
  sections: <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />,
};

interface ScanOptionRowProps {
  icon: ScanOptionIcon;
  title: string;
  hint: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

// One scan setting: icon, what it does, and its switch. The whole row is the switch's label,
// so clicking anywhere on it flips the setting; nothing here opens another page.
export function ScanOptionRow({ icon, title, hint, enabled, onChange }: ScanOptionRowProps) {
  return (
    <label className="lw-scan-option">
      <span className="lw-scan-option__tile" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
      </span>
      <span className="lw-scan-option__text">
        <span className="lw-scan-option__title">{title}</span>
        <span className="lw-scan-option__hint">{hint}</span>
      </span>
      <input type="checkbox" role="switch" className="lw-switch" aria-label={title} checked={enabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
