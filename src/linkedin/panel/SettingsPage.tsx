import type { ReactNode } from "react";
import { HeroNav } from "./MainMenu";

// General LinkWise behavior: how profiles are scanned and highlighted. What to look for and what
// to highlight on a profile stay with Profile Analyzer.
export function SettingsPage({ scanning, highlights }: { scanning: ReactNode; highlights: ReactNode }) {
  return (
    <div className="lw-settings">
      <section className="lw-tool-head lw-tool-head--hero lw-tool-head--settings">
        <HeroNav />
        <h2 className="lw-tool-head__title">Settings</h2>
      </section>
      <section className="lw-settings__group" aria-label="Scanning">
        <h3 className="lw-dash__label">Scanning</h3>
        {scanning}
      </section>
      {highlights}
    </div>
  );
}
