import { useRef } from "react";
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
  if (row.status === "scanning") return row.note ?? "Reading profile details…";
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

// The live scan screen: one progress bar from real stages, then what LinkWise has read, row by row.
export function ScannerView({ profileName, goalName, scanMode, state, resultLabel, onAnalyzeNow, onRetry }: ScannerViewProps) {
  // Never moves backwards when a newly revealed section adds a row.
  const shown = useRef(0);
  shown.current = state.status === "complete" ? 100 : Math.max(shown.current, state.progress);
  // Analyze as I scroll reports what has been read, never a percentage of the whole profile.
  const coverage = scanMode === "scroll";
  const allRead = state.sections.every((row) => row.status !== "pending" && row.status !== "scanning");
  const phase = state.status === "complete" ? "Profile analyzed" : state.status === "analyzing" && allRead ? "Profile scanned" : null;

  return (
    <section className={`lw-scan is-${state.status}`} aria-label="Profile scan">
      <header className="lw-scan__head">
        <span className="lw-scan__eyebrow">{coverage ? "Profile coverage" : "Reading profile"}</span>
        <h3 className="lw-scan__name">{profileName ?? "This profile"}</h3>
        {goalName && (
          <p className="lw-scan__goal">
            Matching for <span>{goalName}</span>
          </p>
        )}
      </header>

      <div className="lw-scan__progress">
        {phase && (
          <p className="lw-scan__phase">
            <StatusMark status="complete" />
            {phase}
          </p>
        )}
        {state.status === "complete" && resultLabel ? (
          <p className="lw-scan__result" role="status">
            {resultLabel}
          </p>
        ) : (
          <div className="lw-scan__status">
            <p className="lw-scan__message" role="status" key={state.message}>
              {state.message}
            </p>
            {!coverage && <span className="lw-scan__percent">{shown.current}%</span>}
          </div>
        )}
        <div className="lw-scan__bar" role="progressbar" aria-valuenow={shown.current} aria-valuemin={0} aria-valuemax={100} aria-label={coverage ? "Profile coverage" : "Scan progress"}>
          <div className="lw-scan__fill" style={{ width: `${shown.current}%` }} />
        </div>
      </div>

      <ul className="lw-scan__rows">
        {state.sections.map((row) => {
          const detail = rowDetail(row);
          return (
            <li key={row.section} className={`lw-scan-row is-${row.status}`} aria-label={`${LABELS[row.section]}: ${STATUS_LABEL[row.status]}`}>
              <StatusMark status={row.status} />
              <span className="lw-scan-row__label">{LABELS[row.section]}</span>
              {detail && <span className="lw-scan-row__detail">{detail}</span>}
            </li>
          );
        })}
      </ul>

      {coverage && state.status === "scanning" && state.active && <p className="lw-scan__hint">Scroll the profile to load more information.</p>}

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
