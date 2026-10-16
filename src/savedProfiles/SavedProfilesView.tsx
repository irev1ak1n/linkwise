import { useState, useSyncExternalStore } from "react";
import { deleteSavedProfile, setSavedProfileNotes } from "../storage/savedProfilesRepository";
import { panelToolPreference } from "../optimizer/optimizerPreferences";
import { firstSentences } from "../linkedin/panel/analysisDetails";
import { getSavedPage, openSavedPage, subscribeSavedPage } from "./savedNav";
import { VISIT_WINDOW_MS } from "./savedProfileCheck";
import { refreshSavedProfiles, useSavedProfiles } from "./savedProfilesStore";
import type { MatchImpact, ProfileChange, SavedProfile } from "./types";

export function formatDay(time: number, now = Date.now()): string {
  const date = new Date(time);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function changeCountText(count: number, since: number): string {
  if (count === 0) return `No meaningful changes since ${formatDay(since)}`;
  return `${count} meaningful change${count === 1 ? "" : "s"} since ${formatDay(since)}`;
}

function icon(change: ProfileChange): string {
  if (change.kind === "added" || change.kind === "metric_added") return "+";
  if (change.kind === "removed" || change.kind === "metric_removed") return "−";
  return change.direction === "improved" ? "↑" : change.direction === "weaker" ? "↓" : "↔";
}

const DIRECTION_LABEL = { improved: "Improved", changed: "Changed", weaker: "Potentially weaker" } as const;

export function ChangeRow({ change }: { change: ProfileChange }) {
  const detail = change.explanation ?? (change.previous && change.current ? `${change.previous} → ${change.current}` : undefined);
  return (
    <li className={`lw-sp-change is-${change.direction}`}>
      <span className="lw-sp-change__icon" aria-hidden="true">
        {icon(change)}
      </span>
      <span className="lw-sp-change__text">
        <span className="lw-sp-change__title">
          {change.title}
          <span className="lw-sp-change__type">{DIRECTION_LABEL[change.direction]}</span>
        </span>
        <span>{change.subject}</span>
        {detail && detail !== change.subject && <span className="lw-sp-change__detail">{detail}</span>}
      </span>
    </li>
  );
}

function scoreText(score: number | null | undefined): string {
  return score === null || score === undefined ? "—" : `${score}%`;
}

function MatchComparison({ impact }: { impact: MatchImpact }) {
  return (
    <div className="lw-sp-match">
      <div>
        <span className="lw-sp-match__label">Current match</span>
        <strong>{scoreText(impact.current)}</strong>
      </div>
      <div>
        <span className="lw-sp-match__label">Previous match</span>
        <strong>{scoreText(impact.previous)}</strong>
      </div>
      {impact.delta !== null && impact.delta !== 0 && <span className={`lw-sp-delta ${impact.delta > 0 ? "is-improved" : "is-weaker"}`}>{impact.delta > 0 ? `+${impact.delta}` : impact.delta}</span>}
      {!impact.sameGoal && impact.previousGoalName && <p className="lw-sp-note">Previous match was for “{impact.previousGoalName}”.</p>}
    </div>
  );
}

// Shown under the Match card on the Profile Analyzer.
export function SavedProfileBar({ saved, checking, onSave }: { saved: SavedProfile | null; checking: boolean; onSave: () => void }) {
  const [saving, setSaving] = useState(false);
  if (!saved) {
    return (
      <div className="lw-sp-bar">
        <button
          type="button"
          className="lw-button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            Promise.resolve(onSave()).finally(() => setSaving(false));
          }}
        >
          Save profile
        </button>
      </div>
    );
  }
  const check = saved.lastCheck;
  const savedThisVisit = !check || (saved.history.length === 1 && saved.history[0]!.origin === "saved" && check.checkedAt - saved.savedAt < VISIT_WINDOW_MS);
  const status = checking ? "Checking for changes…" : savedThisVisit ? `Saved ${formatDay(saved.savedAt)}` : changeCountText(check.changes.length, check.baselineRecordedAt);
  const delta = check?.impact.delta;
  return (
    <div className="lw-sp-bar">
      <span className="lw-sp-saved">✓ Saved</span>
      <span className="lw-sp-bar__status">
        {status}
        {!checking && delta !== null && delta !== undefined && delta !== 0 && (
          <span className={`lw-sp-delta ${delta > 0 ? "is-improved" : "is-weaker"}`}>
            {scoreText(check!.impact.previous)} → {scoreText(check!.impact.current)}
          </span>
        )}
      </span>
      <button
        type="button"
        className="lw-an-more"
        onClick={() => {
          openSavedPage({ page: "detail", profileKey: saved.profileKey });
          panelToolPreference.set("saved");
        }}
      >
        {check && check.changes.length > 0 ? "View changes →" : "View saved profile →"}
      </button>
    </div>
  );
}

function SavedList() {
  const { loaded, list } = useSavedProfiles();
  return (
    <section className="lw-jobs-page">
      <div>
        <h3 className="lw-opt-page__title">Saved profiles</h3>
        <p className="lw-scan-mode__hint">People you saved. Revisit a profile to check it for meaningful changes.</p>
      </div>
      {!loaded ? (
        <p className="lw-empty">Loading saved profiles…</p>
      ) : list.length === 0 ? (
        <p className="lw-empty">No saved profiles yet. Use “Save profile” on the Profile Analyzer.</p>
      ) : (
        <nav className="lw-opt-cards" aria-label="Saved profiles">
          {list.map((profile) => {
            const changes = profile.lastCheck?.changes.length ?? 0;
            const score = profile.lastCheck?.analysis?.matchScore ?? profile.history[0]!.analysis?.matchScore ?? null;
            return (
              <button key={profile.profileKey} type="button" className="lw-opt-card" onClick={() => openSavedPage({ page: "detail", profileKey: profile.profileKey })}>
                <span className="lw-opt-card__text">
                  <span className="lw-opt-card__title">{profile.profileName}</span>
                  <span className="lw-opt-card__subtitle">
                    {scoreText(score)} match · {changes === 0 ? "No changes" : `${changes} change${changes === 1 ? "" : "s"}`} · Last checked {formatDay(profile.lastCheckedAt)}
                  </span>
                </span>
                <span className="lw-opt-card__chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </section>
  );
}

function Notes({ saved }: { saved: SavedProfile }) {
  const [draft, setDraft] = useState(saved.notes);
  return (
    <section className="lw-an-card" aria-label="Notes">
      <h3 className="lw-an-heading">Notes</h3>
      <textarea
        className="lw-sp-notes"
        value={draft}
        placeholder="Private notes, stored only in this browser."
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void setSavedProfileNotes(saved.profileKey, draft).then(refreshSavedProfiles)}
      />
    </section>
  );
}

function SavedDetail({ profileKey }: { profileKey: string }) {
  const { loaded, list } = useSavedProfiles();
  const saved = list.find((profile) => profile.profileKey === profileKey);
  const back = (
    <button type="button" className="lw-opt-back" onClick={() => openSavedPage({ page: "list" })}>
      ← Saved profiles
    </button>
  );
  if (!saved) return <div className="lw-opt-page">{back}<p className="lw-empty">{loaded ? "This profile is no longer saved." : "Loading…"}</p></div>;

  const check = saved.lastCheck;
  const analysis = check?.analysis ?? saved.history[0]!.analysis;
  const impact: MatchImpact = check?.impact ?? { previous: null, current: analysis?.matchScore ?? null, delta: null, sameGoal: true, previousGoalName: null, explanations: [] };
  return (
    <div className="lw-opt-page">
      {back}
      <div>
        <h3 className="lw-opt-page__title">{saved.profileName}</h3>
        <p className="lw-scan-mode__hint">
          Saved {formatDay(saved.savedAt)} · Last checked {formatDay(saved.lastCheckedAt)} ·{" "}
          <a href={saved.profileUrl} className="lw-sp-link">
            Open profile
          </a>
        </p>
      </div>

      <section className="lw-an-card" aria-label="Match">
        <MatchComparison impact={impact} />
        {impact.explanations.length > 0 && (
          <ul className="lw-sp-explanations">
            {impact.explanations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="lw-an-card" aria-label="Changes">
        <h3 className="lw-an-heading">Changes</h3>
        {!check ? (
          <p className="lw-scan-mode__hint">Not checked yet. Revisit this profile to check it for changes.</p>
        ) : (
          <>
            <p className="lw-scan-mode__hint">{changeCountText(check.changes.length, check.baselineRecordedAt)}</p>
            {check.changes.length > 0 && (
              <ul className="lw-sp-changes">
                {check.changes.map((change) => (
                  <ChangeRow key={change.id} change={change} />
                ))}
              </ul>
            )}
            {check.unchecked > 0 && <p className="lw-sp-note">{check.unchecked} wording edit{check.unchecked === 1 ? "" : "s"} could not be checked yet.</p>}
          </>
        )}
      </section>

      {analysis && (
        <section className="lw-an-card" aria-label="Current analysis">
          <h3 className="lw-an-heading">Current analysis</h3>
          <p className="lw-sp-recommendation">{analysis.recommendation}</p>
          <p className="lw-an-summary">{firstSentences(analysis.summary, 3)}</p>
          {analysis.strengths.length > 0 && <p className="lw-sp-note">Strengths: {analysis.strengths.slice(0, 3).join(" · ")}</p>}
          {analysis.gaps.length > 0 && <p className="lw-sp-note">Gaps: {analysis.gaps.slice(0, 2).join(" · ")}</p>}
        </section>
      )}

      <section className="lw-an-card" aria-label="History">
        <h3 className="lw-an-heading">History</h3>
        <ul className="lw-sp-history">
          {saved.history.map((record) => (
            <li key={record.recordedAt}>
              <details>
                <summary>
                  <span>{formatDay(record.recordedAt)}</span>
                  <span>{record.origin === "saved" ? "Saved" : `${record.changes.length} change${record.changes.length === 1 ? "" : "s"}`}</span>
                  <span>{scoreText(record.analysis?.matchScore)}</span>
                </summary>
                {record.changes.length > 0 ? (
                  <ul className="lw-sp-changes">
                    {record.changes.map((change) => (
                      <ChangeRow key={change.id} change={change} />
                    ))}
                  </ul>
                ) : (
                  <p className="lw-sp-note">{record.goal ? `Goal: ${record.goal.name}` : "First snapshot."}</p>
                )}
              </details>
            </li>
          ))}
        </ul>
      </section>

      <Notes key={saved.profileKey} saved={saved} />

      <button
        type="button"
        className="lw-sp-remove"
        onClick={() => {
          void deleteSavedProfile(saved.profileKey).then(refreshSavedProfiles);
          openSavedPage({ page: "list" });
        }}
      >
        Remove from saved
      </button>
    </div>
  );
}

export function SavedProfilesView() {
  const page = useSyncExternalStore(subscribeSavedPage, getSavedPage, getSavedPage);
  return page.page === "detail" ? <SavedDetail profileKey={page.profileKey} /> : <SavedList />;
}
