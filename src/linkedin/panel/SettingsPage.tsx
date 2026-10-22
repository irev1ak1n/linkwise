import type { ReactNode } from "react";
import { SettingsHero } from "./MainMenu";

// General LinkWise behavior: how profiles are scanned and highlighted. What to look for and what
// to highlight on a profile stay with Profile Analyzer. The job filters live here too.
export function SettingsPage({ scanning, highlights, jobFilters }: { scanning: ReactNode; highlights: ReactNode; jobFilters: ReactNode }) {
  return (
    <div className="lw-settings">
      <SettingsHero />
      <section className="lw-settings__group" aria-label="Scanning">
        <h3 className="lw-dash__label">Scanning</h3>
        {scanning}
      </section>
      {highlights}
      {jobFilters}
    </div>
  );
}
