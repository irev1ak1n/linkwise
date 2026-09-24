import type { CollectionState } from "../../models/collection";
import type { ProfileSectionName } from "../../models/profile";
import type { ScanMode } from "./scanModeStore";
import type { AutoScanProgress } from "./panelStore";

const SECTION_LABELS: Record<ProfileSectionName, string> = {
  about: "About",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  organizations: "Organizations",
  volunteering: "Volunteering",
  languages: "Languages",
  honors: "Honors",
};

interface ScanningViewProps {
  profileName?: string;
  goalName?: string;
  collection: CollectionState;
  scanMode: ScanMode;
  autoScanProgress?: AutoScanProgress | null;
  onAnalyzeNow: () => void;
}

// Shown while collection hasn't settled yet. The progress bar reflects what's actually been
// found so far, never a fixed assumed total.
export function ScanningView({ profileName, goalName, collection, scanMode, autoScanProgress, onAnalyzeNow }: ScanningViewProps) {
  const total = collection.sectionsDetected.length;
  const found = collection.sectionsFound.length;
  const percent = total > 0 ? Math.round((found / total) * 100) : 0;

  return (
    <div className="lw-scanning">
      <p className="lw-scanning__title">Loading {profileName ?? "this person"}'s profile…</p>
      {goalName && <p className="lw-scanning__for">For: {goalName}</p>}
      <p className="lw-scanning__hint">
        {scanMode === "auto"
          ? "LinkWise is reading the full profile automatically, no need to scroll."
          : "Keep scrolling and LinkWise will analyze sections as they load."}
      </p>

      {total > 0 ? (
        <>
          <div
            className="lw-progress"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Sections analyzed"
          >
            <div className="lw-progress__fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="lw-fraction">
            Sections analyzed {found} / {total}
          </p>
          <ul className="lw-checklist">
            {collection.sectionsDetected.map((section) => {
              const done = collection.sectionsFound.includes(section);
              return (
                <li key={section} className={done ? "is-done" : "is-pending"}>
                  <span aria-hidden="true">{done ? "✓" : "○"}</span> {SECTION_LABELS[section]}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="lw-fraction">Looking for profile sections…</p>
      )}

      {autoScanProgress && autoScanProgress.sections.length > 0 && (
        <ul className="lw-checklist lw-checklist--detail-pages">
          {autoScanProgress.sections.map((section) => (
            <li key={section.url} className={`is-${section.status}`}>
              <span aria-hidden="true">{section.status === "done" ? "✓" : section.status === "failed" ? "✕" : "○"}</span>{" "}
              {section.heading}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="lw-button lw-button--secondary" onClick={onAnalyzeNow}>
        Analyze available information
      </button>
    </div>
  );
}
