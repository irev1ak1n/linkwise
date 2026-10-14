import { useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { MatchResult } from "../../matching/scoreProfile";
import { matchDisplayColor, matchDisplayLabel, matchDisplayState, type MatchDisplayState } from "../../matching/matchColors";
import { EXPERIENCE_LEVEL_LABELS } from "../../matching/profileAnalysis";
import { buildProfileEvidence } from "../../evidence/buildProfileEvidence";
import { buildFinalAnalysis, type FinalAnalysis } from "../../ai/mergeIntoAnalysis";
import { describeAiUnavailableReason } from "../../ai/aiUnavailableReason";
import { sectionLabel } from "./sectionLabels";
import { criteriaBreakdown, evidenceGroups, firstSentences } from "./analysisDetails";
import { getAnalyzerPage, openAnalyzerPage, subscribeAnalyzerPage } from "./analyzerNav";
import type { AiAnalysisState } from "./useAiAnalysis";
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";

interface AnalysisViewProps {
  result: MatchResult;
  goal: Goal;
  profile: LinkedInProfile;
  /** Always already resolved, "ready" or "unavailable" only. PanelApp shows a LoadingView
   * while AI is still pending. */
  aiState: Extract<AiAnalysisState, { status: "ready" } | { status: "unavailable" }>;
  onRetry?: () => void;
  updatingSection?: string | null;
}

const TOP_REASONS = 3;
const TOP_GAPS = 2;

// The final profile analysis, never a preview of an in-progress read. A statement of
// relevance to the current goal, not a judgment of the person. The dashboard is the quick
// decision; Full analysis and Evidence go deeper over the same result, so switching pages
// never asks for anything new.
export function AnalysisView({ result, goal, profile, aiState, onRetry, updatingSection }: AnalysisViewProps) {
  const page = useSyncExternalStore(subscribeAnalyzerPage, getAnalyzerPage, getAnalyzerPage);
  const evidence = useMemo(() => buildProfileEvidence(profile), [profile]);
  const final = useMemo(() => {
    const ai = aiState.status === "ready" ? { result: aiState.outcome.result, narrative: aiState.outcome.narrative } : undefined;
    return buildFinalAnalysis(goal, profile, evidence, result, ai);
  }, [goal, profile, evidence, result, aiState]);
  const state = matchDisplayState(final.result);
  const status = <AnalysisStatus aiState={aiState} onRetry={onRetry} updatingSection={updatingSection} />;

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
        <Dashboard final={final} goal={goal} state={state} status={status} />
      )}
    </div>
  );
}

function confidenceText(final: FinalAnalysis): string {
  if (final.source !== "ai") return "Local analysis";
  const level = final.confidenceLevel;
  return level ? `AI-enhanced analysis · ${level[0]!.toUpperCase()}${level.slice(1)} confidence` : "AI-enhanced analysis";
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

function MatchCard({ final, goal, state, status }: { final: FinalAnalysis; goal: Goal; state: MatchDisplayState; status: ReactNode }) {
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

function MoreLink({ label, page }: { label: string; page: "full" | "evidence" }) {
  return (
    <button type="button" className="lw-an-more" onClick={() => openAnalyzerPage(page)}>
      {label} →
    </button>
  );
}

function Dashboard({ final, goal, state, status }: { final: FinalAnalysis; goal: Goal; state: MatchDisplayState; status: ReactNode }) {
  const { analysis } = final;
  const reasons = analysis.strengths.slice(0, TOP_REASONS);
  const gaps = analysis.gaps.slice(0, TOP_GAPS);
  return (
    <div className="lw-analysis">
      <MatchCard final={final} goal={goal} state={state} status={status} />

      <section className="lw-an-card">
        <p className="lw-an-summary">{firstSentences(analysis.summary, 3)}</p>
        <MoreLink label="View full analysis" page="full" />
      </section>

      {reasons.length > 0 && (
        <section className="lw-an-card">
          <h3 className="lw-an-heading">Why they match</h3>
          <ul className="lw-an-points">
            {reasons.map((strength) => (
              <li key={strength.label} className="is-good" title={strength.detail}>
                {strength.label}
              </li>
            ))}
          </ul>
          {analysis.strengths.length > TOP_REASONS && <MoreLink label={`View all ${analysis.strengths.length}`} page="full" />}
        </section>
      )}

      {gaps.length > 0 && (
        <section className="lw-an-card">
          <h3 className="lw-an-heading">What's missing</h3>
          <ul className="lw-an-points">
            {gaps.map((gap) => (
              <li key={gap.label} className="is-gap" title={gap.detail}>
                {gap.label}
              </li>
            ))}
          </ul>
          {analysis.gaps.length > TOP_GAPS && <MoreLink label={`View all ${analysis.gaps.length}`} page="full" />}
        </section>
      )}

      {analysis.strengths.length === 0 && analysis.gaps.length === 0 && <p className="lw-empty">No criteria to evaluate for this goal yet.</p>}

      <section className="lw-an-card">
        <h3 className="lw-an-heading">Recommendation</h3>
        <p className="lw-an-recommendation">{analysis.recommendation.label}</p>
        <p>{firstSentences(analysis.recommendation.reason, 1)}</p>
        <MoreLink label="View recommendation" page="full" />
      </section>

      <nav className="lw-opt-cards" aria-label="Analysis details">
        <button type="button" className="lw-opt-card" onClick={() => openAnalyzerPage("full")}>
          <span className="lw-opt-card__text">
            <span className="lw-opt-card__title">Full analysis</span>
            <span className="lw-opt-card__subtitle">Recommendation, criteria, and every reason</span>
          </span>
          <span className="lw-opt-card__chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <button type="button" className="lw-opt-card" onClick={() => openAnalyzerPage("evidence")}>
          <span className="lw-opt-card__text">
            <span className="lw-opt-card__title">Evidence</span>
            <span className="lw-opt-card__subtitle">The profile details behind the score</span>
          </span>
          <span className="lw-opt-card__chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </nav>
    </div>
  );
}

function BackToAnalyzer() {
  return (
    <button type="button" className="lw-opt-back" onClick={() => openAnalyzerPage("home")}>
      ← Profile Analyzer
    </button>
  );
}

function FullAnalysis({ final, goal, state, status }: { final: FinalAnalysis; goal: Goal; state: MatchDisplayState; status: ReactNode }) {
  const { analysis, guidance } = final;
  const rows = criteriaBreakdown(goal, final.result);
  return (
    <div className="lw-analysis">
      <BackToAnalyzer />
      <div className="lw-an-page-head">
        <h3 className="lw-opt-page__title">Full analysis</h3>
        <CompactScore state={state} />
      </div>
      {status}

      <section className="lw-an-card">
        <h3 className="lw-an-heading">Summary</h3>
        <p>{analysis.summary}</p>
      </section>

      <section className="lw-an-card">
        <h3 className="lw-an-heading">Recommendation</h3>
        <p className="lw-an-recommendation">{analysis.recommendation.label}</p>
        <p>{analysis.recommendation.reason}</p>
        {guidance.contactReason && guidance.contactReason !== analysis.recommendation.reason && <p>{guidance.contactReason}</p>}
      </section>

      <section className="lw-an-card">
        <h3 className="lw-an-heading">Experience assessment</h3>
        <p className="lw-an-recommendation">{EXPERIENCE_LEVEL_LABELS[analysis.experienceLevel]}</p>
        {analysis.experienceLevelReason && <p>{analysis.experienceLevelReason}</p>}
      </section>

      {analysis.strengths.length > 0 && (
        <section className="lw-an-card">
          <h3 className="lw-an-heading">Why they match</h3>
          <ul className="lw-an-points lw-an-points--detailed">
            {analysis.strengths.map((strength) => (
              <li key={strength.label} className="is-good">
                <strong>{strength.label}</strong>
                {strength.detail && <span>{strength.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.gaps.length > 0 && (
        <section className="lw-an-card">
          <h3 className="lw-an-heading">What's missing</h3>
          <ul className="lw-an-points lw-an-points--detailed">
            {analysis.gaps.map((gap) => (
              <li key={gap.label} className="is-gap">
                <strong>{gap.label}</strong>
                {gap.detail && <span>{gap.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length > 0 && (
        <section className="lw-an-card">
          <h3 className="lw-an-heading">Criteria breakdown</h3>
          <ul className="lw-an-criteria">
            {rows.map((row) => (
              <li key={row.id}>
                <div className="lw-an-criteria__head">
                  <span className="lw-an-criteria__label">{row.label}</span>
                  <span className={`lw-an-chip is-${row.strength}`}>{row.assessment}</span>
                </div>
                <span className="lw-an-criteria__importance">{row.importance}</span>
                {row.evidence && <blockquote className="lw-an-quote">{row.evidence}</blockquote>}
                {row.note && <p className="lw-an-criteria__note">{row.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
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
