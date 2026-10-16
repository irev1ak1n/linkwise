import { useRef, type ReactNode } from "react";
import type { ProfileSectionName } from "../../models/profile";
import type { ScanMode } from "./scanModeStore";
import type { ScanState, SectionScan } from "./scanProgress";

const LABELS: Record<ProfileSectionName, string> = {
  about: "About",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
  skills: "Skills",
  certifications: "Licenses & Certifications",
  languages: "Languages",
  honors: "Honors & Awards",
  volunteering: "Volunteer Experience",
  organizations: "Organizations",
};

const UNITS: Partial<Record<ProfileSectionName, [string, string]>> = {
  experience: ["role", "roles"],
  education: ["school", "schools"],
  skills: ["skill", "skills"],
  projects: ["project", "projects"],
  certifications: ["certification", "certifications"],
  languages: ["language", "languages"],
  honors: ["award", "awards"],
  volunteering: ["role", "roles"],
  organizations: ["organization", "organizations"],
};

const ICON_PATHS: Record<ProfileSectionName, ReactNode> = {
  about: (
    <>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13.5c.6-2.4 2.4-3.7 4.5-3.7s3.9 1.3 4.5 3.7" />
    </>
  ),
  experience: (
    <>
      <rect x="2.5" y="5" width="11" height="8" rx="1.5" />
      <path d="M6 5V3.8c0-.5.4-.8.8-.8h2.4c.4 0 .8.3.8.8V5M2.5 8.5h11" />
    </>
  ),
  projects: <path d="M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3M9 3.5 7 12.5" />,
  education: (
    <>
      <path d="M1.5 6.5 8 3.5l6.5 3L8 9.5z" />
      <path d="M4.5 8v3c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5V8" />
    </>
  ),
  skills: <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2" />,
  certifications: (
    <>
      <circle cx="8" cy="6.5" r="3.5" />
      <path d="m6 9.5-1 4 3-1.5 3 1.5-1-4" />
    </>
  ),
  languages: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M2.5 8h11M8 2.5c1.6 1.6 2.3 3.4 2.3 5.5S9.6 11.9 8 13.5M8 2.5C6.4 4.1 5.7 5.9 5.7 8s.7 3.9 2.3 5.5" />
    </>
  ),
  honors: (
    <>
      <path d="M5 3h6v3a3 3 0 0 1-6 0zM5 4.5H3a2 2 0 0 0 2 2.5M11 4.5h2a2 2 0 0 1-2 2.5" />
      <path d="M8 9v2.5M5.5 13.5h5" />
    </>
  ),
  volunteering: <path d="M8 13.5S2.5 10.2 2.5 6.4A2.9 2.9 0 0 1 8 4.8a2.9 2.9 0 0 1 5.5 1.6C13.5 10.2 8 13.5 8 13.5z" />,
  organizations: (
    <>
      <rect x="3" y="2.5" width="10" height="11" rx="1" />
      <path d="M6 5.5h1M9 5.5h1M6 8h1M9 8h1M7 13.5v-2.5h2v2.5" />
    </>
  ),
};

function SectionIcon({ section }: { section: ProfileSectionName }) {
  return (
    <svg className="lw-scan-row__icon" viewBox="0 0 16 16" aria-hidden="true">
      {ICON_PATHS[section]}
    </svg>
  );
}

function StatusMark({ status }: { status: SectionScan["status"] }) {
  if (status === "complete") {
    return (
      <svg className="lw-scan-mark is-complete" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" />
        <path d="m5 8.2 2 2 4-4.2" />
      </svg>
    );
  }
  if (status === "scanning") return <span className="lw-scan-mark is-scanning" aria-hidden="true" />;
  if (status === "not_found" || status === "skipped") return <span className="lw-scan-mark is-absent" aria-hidden="true">—</span>;
  return <span className="lw-scan-mark is-pending" aria-hidden="true" />;
}

function rowDetail(row: SectionScan): string | null {
  if (row.status === "scanning") return row.note ?? "Scanning…";
  if (row.status === "not_found") return "Not found";
  if (row.status === "skipped") return row.note ?? "Skipped";
  if (row.status === "complete") {
    const unit = UNITS[row.section];
    if (row.count && unit) return `${row.count} ${row.count === 1 ? unit[0] : unit[1]}`;
    return row.note ?? null;
  }
  return row.note ?? null;
}

const STATUS_LABEL: Record<SectionScan["status"], string> = {
  pending: "pending",
  scanning: "scanning",
  complete: "complete",
  not_found: "not found",
  skipped: "skipped",
};

interface ScannerViewProps {
  profileName?: string;
  goalName?: string;
  scanMode: ScanMode;
  state: ScanState;
  /** Shown once the scan completes, e.g. "96% · Strong match". */
  resultLabel?: string;
  onAnalyzeNow?: () => void;
  onRetry?: () => void;
}

// The live scan screen: what LinkWise has read so far, section by section.
export function ScannerView({ profileName, goalName, scanMode, state, resultLabel, onAnalyzeNow, onRetry }: ScannerViewProps) {
  // Never moves backwards when a newly revealed section adds a row.
  const shown = useRef(0);
  shown.current = state.status === "complete" ? 100 : Math.max(shown.current, state.progress);
  const coverage = scanMode === "scroll" && (state.status === "scanning" || state.status === "analyzing");

  return (
    <section className={`lw-scan is-${state.status}`} aria-label="Profile scan">
      <header className="lw-scan__head">
        <p className="lw-scan__reading">
          Reading <strong className="lw-scan__name">{profileName ?? "this person"}</strong>'s profile…
        </p>
        {goalName && (
          <p className="lw-scan__goal">
            For <span>{goalName}</span>
          </p>
        )}
      </header>

      <div className="lw-scan__status">
        <p className="lw-scan__message" role="status" key={state.message}>
          {state.message}
        </p>
        {!coverage && <span className="lw-scan__percent">{shown.current}%</span>}
      </div>
      <div className="lw-scan__bar" role="progressbar" aria-valuenow={shown.current} aria-valuemin={0} aria-valuemax={100} aria-label="Scan progress">
        <div className="lw-scan__fill" style={{ width: `${shown.current}%` }} />
      </div>

      {state.status === "complete" && resultLabel && <p className="lw-scan__result">{resultLabel}</p>}

      {state.status === "analyzing" && (
        <div className="lw-scan__handoff" aria-hidden="true">
          <span>Profile data</span>
          <span className="lw-scan__handoff-arrow" />
          <span>Match analysis</span>
        </div>
      )}

      <h4 className="lw-scan__label">{coverage ? "Profile coverage" : "Sections"}</h4>
      <ul className="lw-scan__rows">
        {state.sections.map((row) => {
          const detail = rowDetail(row);
          return (
            <li key={row.section} className={`lw-scan-row is-${row.status}`} aria-label={`${LABELS[row.section]}: ${STATUS_LABEL[row.status]}`}>
              <StatusMark status={row.status} />
              <SectionIcon section={row.section} />
              <span className="lw-scan-row__label">{LABELS[row.section]}</span>
              {detail && <span className="lw-scan-row__detail">{detail}</span>}
            </li>
          );
        })}
      </ul>

      {coverage && <p className="lw-scan__hint">Scroll the profile to load more information. Sections update as they appear.</p>}

      {state.status === "error" ? (
        <div className="lw-scan__actions">
          {onRetry && (
            <button type="button" className="lw-button" onClick={onRetry}>
              Try again
            </button>
          )}
          {onAnalyzeNow && (
            <button type="button" className="lw-scan__link" onClick={onAnalyzeNow}>
              Analyze what was found
            </button>
          )}
        </div>
      ) : (
        state.status === "scanning" &&
        onAnalyzeNow && (
          <button type="button" className="lw-scan__link" onClick={onAnalyzeNow}>
            Analyze available information
          </button>
        )
      )}
    </section>
  );
}
