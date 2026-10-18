import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { MatchResult } from "../../matching/scoreProfile";
import { matchDisplayColor, matchDisplayLabel, matchDisplayState, type MatchDisplayState } from "../../matching/matchColors";
import { EXPERIENCE_LEVEL_LABELS, type RecommendationLabel } from "../../matching/profileAnalysis";
import { buildProfileEvidence } from "../../evidence/buildProfileEvidence";
import { buildFinalAnalysis, type FinalAnalysis } from "../../ai/mergeIntoAnalysis";
import { describeAiUnavailableReason } from "../../ai/aiUnavailableReason";
import { sectionLabel } from "./sectionLabels";
import { confirmedCriteria, criteriaBreakdown, evidenceGroups, firstSentences } from "./analysisDetails";
import { getAnalyzerPage, openAnalyzerPage, subscribeAnalyzerPage } from "./analyzerNav";
import type { AiAnalysisState } from "./useAiAnalysis";
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";
import { SavedProfileBar } from "../../savedProfiles/SavedProfilesView";
import type { SignalAnalysisState } from "../../ai/signalAnalysisController";
import { KeyEvidence } from "./KeyEvidence";
import { useSavedProfileTracking } from "../../savedProfiles/useSavedProfileTracking";

interface AnalysisViewProps {
  profileKey?: string | null;
  result: MatchResult;
  goal: Goal;
  profile: LinkedInProfile;
  /** Always already resolved, "ready" or "unavailable" only. PanelApp shows the scan screen
   * while AI is still pending. */
  aiState: Extract<AiAnalysisState, { status: "ready" } | { status: "unavailable" }>;
  onRetry?: () => void;
  updatingSection?: string | null;
  /** The signal analysis behind Signal Mode, whose facts are the dashboard's Key Evidence. */
  signalAnalysis?: SignalAnalysisState;
}

const TOP_REASONS = 4;

// The final profile analysis, never a preview of an in-progress read. A statement of
// relevance to the current goal, not a judgment of the person. The dashboard is the quick
// decision; Full analysis and Evidence go deeper over the same result, so switching pages
// never asks for anything new.
export function AnalysisView({ profileKey = null, result, goal, profile, aiState, onRetry, updatingSection, signalAnalysis }: AnalysisViewProps) {
  const page = useSyncExternalStore(subscribeAnalyzerPage, getAnalyzerPage, getAnalyzerPage);
  const evidence = useMemo(() => buildProfileEvidence(profile), [profile]);
  const final = useMemo(() => {
    const ai = aiState.status === "ready" ? { result: aiState.outcome.result, narrative: aiState.outcome.narrative } : undefined;
    return buildFinalAnalysis(goal, profile, evidence, result, ai);
  }, [goal, profile, evidence, result, aiState]);
  const state = matchDisplayState(final.result);
  const status = <AnalysisStatus aiState={aiState} onRetry={onRetry} updatingSection={updatingSection} />;
  const tracking = useSavedProfileTracking({ profileKey, profile, goal, final, ready: aiState.status === "ready" && !aiState.updating });
  const savedBar = profileKey ? <SavedProfileBar saved={tracking.saved} checking={tracking.checking} onSave={tracking.save} /> : null;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const homeScroll = useRef(0);
  const lastPage = useRef(page);
  // A detail page opens at its top; the dashboard comes back where it was left.
  useLayoutEffect(() => {
    const scroller = rootRef.current?.closest(".lw-panel__body");
    if (!scroller) return;
    if (lastPage.current !== page) {
      scroller.scrollTop = page === "home" ? homeScroll.current : 0;
      lastPage.current = page;
    }
    if (page !== "home") return;
    const remember = () => (homeScroll.current = scroller.scrollTop);
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [page]);

  const narrative = aiState.status === "ready" ? aiState.outcome.narrative : undefined;
  return (
    <div ref={rootRef}>
      {page === "full" ? (
        <FullAnalysis final={final} goal={goal} state={state} status={status} />
      ) : page === "evidence" ? (
        <EvidencePage final={final} profile={profile} narrative={narrative} state={state} />
      ) : (
        <Dashboard
          final={final}
          goal={goal}
          state={state}
          status={status}
          savedBar={savedBar}
          keyEvidence={signalAnalysis && <KeyEvidence analysis={signalAnalysis} updatingSection={updatingSection} exclude={confirmedCriteria(goal, final.result, TOP_REASONS).flatMap((c) => (c.detail ? [c.detail] : []))} />}
        />
      )}
    </div>
  );
}

function confidenceText(final: FinalAnalysis): string {
  if (final.source !== "ai") return "Local analysis";
  const level = final.confidenceLevel;
  return level ? `${level[0]!.toUpperCase()}${level.slice(1)} confidence` : "AI-enhanced analysis";
}

function AnalysisStatus({ aiState, onRetry, updatingSection }: Pick<AnalysisViewProps, "aiState" | "onRetry" | "updatingSection">) {
  const retry = onRetry && (
    <button type="button" className="lw-ai-retry" onClick={onRetry}>
      Retry
    </button>
  );
  if (aiState.status === "unavailable") {
    return (
      <p className="lw-ai-status">
        AI analysis unavailable ({describeAiUnavailableReason(aiState.reason)}) — showing local analysis.{retry}
      </p>
    );
  }
  if (aiState.updating) return <p className="lw-ai-status">Updating{sectionLabel(updatingSection) ? ` with ${sectionLabel(updatingSection)}` : ""}…</p>;
  if (aiState.updateError) return <p className="lw-ai-status">Couldn't update with the latest information — showing the previous analysis.{retry}</p>;
  return null;
}

function ScoreNotes({ final, state }: { final: FinalAnalysis; state: MatchDisplayState }) {
  if (state.kind === "low_confidence") return <p className="lw-an-score__note">Limited profile information — this score may change once more of the profile loads.</p>;
  if (final.result.scorePercent === null) return <p className="lw-an-score__note">Add at least one criterion (other than Excluded) to score this profile.</p>;
  if (!final.result.complete) return <p className="lw-an-score__note">A Must-Have criterion could not be confirmed on this profile.</p>;
  return null;
}

function MatchCard({ final, goal, state, status, savedBar }: { final: FinalAnalysis; goal: Goal; state: MatchDisplayState; status: ReactNode; savedBar?: ReactNode }) {
  const color = matchDisplayColor(state);
  return (
    <section className="lw-an-score" style={{ borderTopColor: color }}>
      <span className="lw-an-score__level" style={{ color }}>
        {matchDisplayLabel(state)}
      </span>
      {"scorePercent" in state && <span className="lw-an-score__value">{state.scorePercent}%</span>}
      <span className="lw-an-score__goal">{goal.name}</span>
      <span className="lw-an-score__source">{confidenceText(final)}</span>
      <ScoreNotes final={final} state={state} />
      {status}
      {savedBar}
    </section>
  );
}

function CompactScore({ state }: { state: MatchDisplayState }) {
  const color = matchDisplayColor(state);
  return (
    <div className="lw-an-compact" style={{ color }}>
      <span>{matchDisplayLabel(state)}</span>
      {"scorePercent" in state && <strong>{state.scorePercent}%</strong>}
    </div>
  );
}

// The quick read: how strong, who, and why. Full analysis and Evidence stay reachable by route for a later UI.
function Dashboard({ final, goal, state, status, savedBar, keyEvidence }: { final: FinalAnalysis; goal: Goal; state: MatchDisplayState; status: ReactNode; savedBar?: ReactNode; keyEvidence?: ReactNode }) {
  const { analysis } = final;
  const confirmed = confirmedCriteria(goal, final.result, TOP_REASONS);
  return (
    <div className="lw-analysis lw-dash">
      <MatchCard final={final} goal={goal} state={state} status={status} savedBar={savedBar} />

      <section className="lw-dash__block" aria-label="Summary">
        <h3 className="lw-dash__label">Summary</h3>
        <p className="lw-an-summary">{firstSentences(analysis.summary, 3)}</p>
      </section>

      {goal.criteria.some((c) => c.importance !== "EXCLUDED") && (
        <section className="lw-dash__block" aria-label="Why they match">
          <h3 className="lw-dash__label">Why they match</h3>
          {confirmed.length > 0 ? (
            <ul className="lw-an-points lw-an-points--detailed">
              {confirmed.map((criterion) => (
                <li key={criterion.id} className="is-good">
                  <strong>{criterion.label}</strong>
                  {criterion.detail && <span>{criterion.detail}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="lw-dash__none">None of the criteria you're looking for were confirmed on this profile.</p>
          )}
        </section>
      )}

      {analysis.strengths.length === 0 && analysis.gaps.length === 0 && <p className="lw-empty">No criteria to evaluate for this goal yet.</p>}

      {keyEvidence}
    </div>
  );
}

function BackToAnalyzer() {
  return (
    <button type="button" className="lw-opt-back" onClick={() => openAnalyzerPage("home")}>
      ← Back to Profile Analyzer
    </button>
  );
}

function FullAnalysis({ final, goal, state, status }: { final: FinalAnalysis; goal: Goal; state: MatchDisplayState; status: ReactNode }) {
  const { analysis } = final;
  const rows = criteriaBreakdown(goal, final.result);
  return (
    <div className="lw-analysis lw-fa">
      <BackToAnalyzer />
      <div className="lw-an-page-head">
        <h3 className="lw-opt-page__title">Full analysis</h3>
        <CompactScore state={state} />
      </div>
      {status}

      <section className="lw-fa-summary" aria-label="Summary">
        <h4 className="lw-fa-label">Summary</h4>
        <p>{firstSentences(analysis.summary, 4)}</p>
      </section>

      <RecommendationCard label={analysis.recommendation.label} reason={analysis.recommendation.reason} sentences={2} />

      {analysis.strengths.length > 0 && (
        <section className="lw-fa-list is-match" aria-label="Why they match">
          <h4 className="lw-fa-label">Why they match</h4>
          <ul>
            {analysis.strengths.map((strength) => (
              <li key={strength.label}>
                <strong>{strength.label}</strong>
                {strength.detail && <span>{firstSentences(strength.detail, 1)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.gaps.length > 0 && (
        <section className="lw-fa-list is-gap" aria-label="What's missing">
          <h4 className="lw-fa-label">What's missing</h4>
          <ul>
            {analysis.gaps.map((gap) => (
              <li key={gap.label}>
                <strong>{gap.label}</strong>
                {gap.detail && <span>{firstSentences(gap.detail, 1)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="lw-fa-experience" aria-label="Experience">
        <div>
          <h4 className="lw-fa-label">Experience</h4>
          <span className="lw-fa-experience__level">{EXPERIENCE_LEVEL_LABELS[analysis.experienceLevel]}</span>
        </div>
        {analysis.experienceLevelReason && <p>{firstSentences(analysis.experienceLevelReason, 1)}</p>}
      </section>

      {rows.length > 0 && (
        <section className="lw-fa-criteria" aria-label="Criteria breakdown">
          <h4 className="lw-fa-label">Criteria breakdown</h4>
          {rows.map((row) => (
            <details key={row.id} className="lw-fa-criterion">
              <summary>
                <span className="lw-fa-criterion__label">{row.label}</span>
                <span className={`lw-an-chip is-${row.strength}`}>{row.assessment}</span>
              </summary>
              <div className="lw-fa-criterion__body">
                <span className="lw-an-criteria__importance">{row.importance}</span>
                {row.evidence && <blockquote className="lw-an-quote">{row.evidence}</blockquote>}
                {row.note && <p className="lw-an-criteria__note">{row.note}</p>}
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}

// The deterministic recommendation label, as a decision: green to contact, amber to look closer,
// red for a weak fit.
const RECOMMENDATION_TONE: Record<RecommendationLabel, "good" | "maybe" | "weak"> = {
  "Strong candidate — worth contacting": "good",
  "Worth contacting": "good",
  "Consider / investigate further": "maybe",
  "Low priority": "weak",
  "Not worth prioritizing for this goal": "weak",
};

// AI reasons often open by repeating the decision itself ("Strong candidate. His…").
export function withoutLabelEcho(reason: string, label: string): string {
  const parts = label.split(" — ").map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"));
  return reason.replace(new RegExp(`^\\s*(?:${parts.join("|")})[.!:]\\s*`, "i"), "").trim();
}

export function RecommendationCard({ label, reason: rawReason, sentences, more }: { label: RecommendationLabel; reason: string; sentences: number; more?: ReactNode }) {
  const [headline, detail] = label.split(" — ");
  const reason = firstSentences(withoutLabelEcho(rawReason, label), sentences);
  return (
    <section className={`lw-fa-decision is-${RECOMMENDATION_TONE[label]}`} aria-label="Recommendation">
      <h4 className="lw-fa-label">Recommendation</h4>
      <p className="lw-fa-decision__headline">{headline}</p>
      {detail && <p className="lw-fa-decision__detail">{detail[0]!.toUpperCase() + detail.slice(1)}</p>}
      {reason && <p className="lw-fa-decision__reason">{reason}</p>}
      {more}
    </section>
  );
}

function EvidencePage({
  final,
  profile,
  narrative,
  state,
}: {
  final: FinalAnalysis;
  profile: LinkedInProfile;
  narrative: Parameters<typeof evidenceGroups>[2];
  state: MatchDisplayState;
}) {
  const groups = evidenceGroups(profile, final.result, narrative);
  return (
    <div className="lw-analysis">
      <BackToAnalyzer />
      <div className="lw-an-page-head">
        <h3 className="lw-opt-page__title">Evidence</h3>
        <CompactScore state={state} />
      </div>
      <p className="lw-scan-mode__hint">The profile details that supported this analysis, quoted from the profile.</p>
      {groups.length === 0 && <p className="lw-empty">No supporting profile details were found for this goal.</p>}
      {groups.map((group) => (
        <section key={group.title} className="lw-an-card">
          <h3 className="lw-an-heading">{group.title}</h3>
          <ul className="lw-an-evidence">
            {group.items.map((item) => (
              <li key={item.id}>
                <span className="lw-an-evidence__section">{sectionLabel(item.section) ?? (item.section === "headline" ? "Headline" : item.section)}</span>
                <span>{item.excerpt}</span>
                {item.excerpt !== item.text && (
                  <details className="lw-an-evidence__full">
                    <summary>Full text</summary>
                    {item.text}
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
