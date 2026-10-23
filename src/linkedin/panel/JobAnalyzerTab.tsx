import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Goal } from "../../models/goal";
import { JobAnalyzerController, type JobAnalyzerState } from "../../jobs/jobAnalyzerController";
import { requestJobAnalysis } from "../../jobs/jobAnalysisClient";
import { highlightTargets } from "../../jobs/jobHighlightTargets";
import type { JobAnalysis } from "../../jobs/jobTypes";
import type { MatchResult } from "../../matching/scoreProfile";
import { matchDisplayColor, matchDisplayLabel, matchDisplayState, type MatchDisplayState } from "../../matching/matchColors";
import { StatusMark } from "./ScannerView";
import { JobHighlighter } from "../jobs/jobHighlighter";
import { currentJobId, expandCollapsed, findJobDetails, readJobPosting } from "../jobs/jobPageReader";
import { isPanelVisible, subscribePanelVisibility } from "./panelVisibilityStore";
import { GoalSetupSection } from "./GoalSetupSection";
import { jobGoalPreference } from "./jobGoalStore";
import { useStoredPreference } from "./useStoredPreference";
import { createCriterion, createGoal } from "../../models/goal";
import type { DraftCriterionInput } from "./goalStore";

const MUTATION_DEBOUNCE_MS = 600;
const HREF_POLL_MS = 1000;

function createController(goal: Goal | null): JobAnalyzerController {
  const highlighter = new JobHighlighter(document);
  return new JobAnalyzerController(
    {
      currentJobId: () => currentJobId(location.href, document),
      expand: () => {
        const root = findJobDetails(document);
        return root ? expandCollapsed(root) : 0;
      },
      read: () => readJobPosting(document, location.href),
      analyze: requestJobAnalysis,
      highlight: (analysis) => {
        // Only the posting's own description and company text is marked, never the top card or the rest of the page.
        const sections = [...document.querySelectorAll('[componentkey^="JobDetails_AboutTheJob_"], [componentkey^="JobDetails_AboutTheCompany_"], .jobs-description, .jobs-company')];
        const roots = sections.length > 0 ? sections : [findJobDetails(document)].filter((r): r is HTMLElement => r !== null);
        if (!analysis || roots.length === 0) highlighter.clear();
        else highlighter.render(roots, highlightTargets(analysis));
      },
    },
    goal,
  );
}

// Runs the analyzer while the tab is on screen: one check when it opens, then one whenever LinkedIn's
// page changes, debounced. check() itself decides from the job id whether anything is new, so a burst
// of mutations never turns into a burst of work.
export function useJobAnalyzer(goal: Goal | null, active: boolean): { state: JobAnalyzerState; retry: () => void } {
  const ref = useRef<JobAnalyzerController | null>(null);
  ref.current ??= createController(goal);
  const controller = ref.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const goalKey = JSON.stringify(goal?.criteria.map((c) => [c.id, c.label, c.importance]) ?? []);

  useEffect(() => controller.setGoal(goal), [controller, goalKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) {
      controller.stop();
      return;
    }
    controller.check();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => controller.check(), MUTATION_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const poll = setInterval(() => controller.check(), HREF_POLL_MS);
    return () => {
      observer.disconnect();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      controller.stop();
    };
  }, [controller, active]);

  return { state, retry: () => controller.retry() };
}

const KEY_EVIDENCE_SHOWN = 5;

function confidenceText(analysis: JobAnalysis): string {
  if (!analysis.aiAvailable) return "Local analysis";
  const c = analysis.overallMatch.confidence;
  return c >= 0.7 ? "High confidence" : c >= 0.4 ? "Medium confidence" : "Low confidence";
}

// The score as the Profile Analyzer shows it: the same bands, colors, and labels.
function displayState(analysis: JobAnalysis): MatchDisplayState {
  return matchDisplayState({ scorePercent: analysis.overallMatch.score, disqualified: analysis.overallMatch.disqualified, confidence: analysis.overallMatch.confidence } as MatchResult);
}

const stateLabel = (state: MatchDisplayState) => (state.kind === "low_confidence" ? "Limited Listing Information" : matchDisplayLabel(state));

// The same quick read as the Profile Analyzer's dashboard: how strong, why, and the evidence behind it.
export function JobAnalysisView({ analysis, hasCriteria }: { analysis: JobAnalysis; hasCriteria: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { job } = analysis;
  const state = displayState(analysis);
  const color = matchDisplayColor(state);
  const confirmed = analysis.criteriaMatches.filter((m) => m.status === "strong" || m.status === "match" || m.status === "partial");
  const evidence = expanded ? analysis.keyEvidence : analysis.keyEvidence.slice(0, KEY_EVIDENCE_SHOWN);
  const hidden = analysis.keyEvidence.length - evidence.length;
  const heading = [job.title || "This job", job.company].filter(Boolean).join(" · ");
  return (
    <div className="lw-analysis lw-dash">
      {hasCriteria ? (
        <section className="lw-an-score" style={{ borderTopColor: color }}>
          <span className="lw-an-score__level" style={{ color }}>
            {stateLabel(state)}
          </span>
          {"scorePercent" in state && <span className="lw-an-score__value">{state.scorePercent}%</span>}
          <span className="lw-an-score__goal">{heading}</span>
          <span className="lw-an-score__source">{confidenceText(analysis)}</span>
          {state.kind === "low_confidence" && <p className="lw-an-score__note">Only part of what you're looking for is covered by this listing, so this score may be rough.</p>}
          {state.kind === "not_enough_info" && <p className="lw-an-score__note">The listing doesn't say enough about what you're looking for to score it.</p>}
        </section>
      ) : (
        <section className="lw-dash__block" aria-label="Job">
          <h3 className="lw-dash__label">{heading}</h3>
        </section>
      )}

      <section className="lw-dash__block" aria-label="Summary">
        <h3 className="lw-dash__label">Summary</h3>
        <p className="lw-an-summary">{analysis.summary}</p>
      </section>

      {hasCriteria && (
        <section className="lw-dash__block" aria-label="Why it matches">
          <h3 className="lw-dash__label">Why it matches</h3>
          {confirmed.length > 0 ? (
            <ul className="lw-an-points lw-an-points--detailed">
              {confirmed.map((match) => (
                <li key={match.criterionId} className="is-good">
                  <strong>{match.criterion}</strong>
                  <span>{match.reasoning}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="lw-dash__none">None of the things you're looking for were confirmed in this listing.</p>
          )}
        </section>
      )}

      {analysis.keyEvidence.length > 0 && (
        <section className="lw-dash__block" aria-label="Key evidence">
          <h3 className="lw-dash__label">Key evidence</h3>
          <ul className="lw-key-evidence">
            {evidence.map((fact) => (
              <li key={fact.text} title={fact.evidence}>
                {fact.text}
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <button type="button" className="lw-scan__link" onClick={() => setExpanded(true)}>
              Show {hidden} more
            </button>
          )}
        </section>
      )}
    </div>
  );
}

// The Profile Analyzer's scan screen, for a job: the same bar, shimmer, rows, and result line.
function JobScanView({ step, goalName, resultLabel }: { step: "reading" | "analyzing" | "done"; goalName?: string; resultLabel?: string }) {
  const percent = step === "reading" ? 25 : step === "analyzing" ? 70 : 100;
  const shown = useRef(0);
  shown.current = Math.max(shown.current, percent);
  const rows: { label: string; status: "complete" | "scanning" | "pending"; detail?: string }[] = [
    { label: "Job posting", status: step === "reading" ? "scanning" : "complete", detail: step === "reading" ? "Reading the full description…" : undefined },
    { label: "Requirements and pay", status: step === "reading" ? "pending" : "complete" },
    { label: "Your criteria", status: step === "done" ? "complete" : step === "analyzing" ? "scanning" : "pending", detail: step === "analyzing" ? "Comparing the job to what you want…" : undefined },
  ];
  return (
    <section className={`lw-scan is-${step === "done" ? "complete" : "scanning"}`} aria-label="Job scan">
      <header className="lw-scan__head">
        <span className="lw-scan__eyebrow">{step === "done" ? "Job analyzed" : "Reading job"}</span>
        <h3 className="lw-scan__name">This job</h3>
        {goalName && (
          <p className="lw-scan__goal">
            Matching for <span>{goalName}</span>
          </p>
        )}
      </header>
      <div className="lw-scan__progress">
        {step === "done" && resultLabel ? (
          <p className="lw-scan__result" role="status">
            {resultLabel}
          </p>
        ) : (
          <div className="lw-scan__status">
            <p className="lw-scan__message" role="status" key={step}>
              {step === "reading" ? "Reading the full job posting…" : "Analyzing the job…"}
            </p>
            <span className="lw-scan__percent">{shown.current}%</span>
          </div>
        )}
        <div className="lw-scan__bar" role="progressbar" aria-valuenow={shown.current} aria-valuemin={0} aria-valuemax={100} aria-label="Scan progress">
          <div className="lw-scan__fill" style={{ width: `${shown.current}%` }} />
        </div>
      </div>
      <ul className="lw-scan__rows">
        {rows.map((row) => (
          <li key={row.label} className={`lw-scan-row is-${row.status}`} aria-label={`${row.label}: ${row.status}`}>
            <StatusMark status={row.status} />
            <span className="lw-scan-row__label">{row.label}</span>
            {row.detail && <span className="lw-scan-row__detail">{row.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

const REVEAL_MS = 1400;

const JOB_COPY = {
  heading: "What are you looking for in a job?",
  vague: "We couldn't find enough detail in that description — try adding a role, workplace type, pay, or experience level.",
};

export function JobAnalyzerTab() {
  const { value: goal } = useStoredPreference(jobGoalPreference);
  const visible = useSyncExternalStore(subscribePanelVisibility, isPanelVisible, isPanelVisible);
  const { state, retry } = useJobAnalyzer(goal ?? null, visible);
  const hasCriteria = (goal?.criteria.filter((c) => c.importance !== "EXCLUDED").length ?? 0) > 0;

  const setJobGoal = (name: string, description: string, criteria: DraftCriterionInput[]) =>
    jobGoalPreference.set({
      ...(goal ?? createGoal(name || "My job search")),
      name: name || goal?.name || "My job search",
      description,
      criteria: criteria.map((c) => createCriterion(c.label, c.importance, { category: c.category, groupId: c.groupId, value: c.value, operator: c.operator, sourceText: c.sourceText })),
    });
  // Same card as the Profile Analyzer's, with its own saved value, about jobs.
  const criteriaCard = <GoalSetupSection goal={goal ?? null} profileKey={null} kind="job" onSetActiveCriteria={setJobGoal} copy={JOB_COPY} />;

  // A job that was just read and analyzed gets the scan screen's finish before its result; one already known does not.
  const animated = useRef(new Set<string>());
  const [revealed, setRevealed] = useState<string | null>(null);
  if (state.status === "reading" || state.status === "analyzing") animated.current.add(state.jobId);
  const revealing = state.status === "ready" && !state.aiError && animated.current.has(state.jobId) && revealed !== state.jobId;
  const readyJobId = state.status === "ready" ? state.jobId : null;
  useEffect(() => {
    if (!revealing || !readyJobId) return;
    const timer = setTimeout(() => setRevealed(readyJobId), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealing, readyJobId]);

  if (state.status === "idle" || state.status === "no_job") {
    return (
      <>
        {criteriaCard}
        <p className="lw-empty">Open a LinkedIn job to analyze it. Click a listing in your search results.</p>
      </>
    );
  }
  if (state.status === "reading" || state.status === "analyzing") {
    return (
      <>
        {criteriaCard}
        <JobScanView step={state.status === "reading" ? "reading" : "analyzing"} goalName={goal?.name} />
      </>
    );
  }
  if (revealing) {
    const shown = displayState(state.analysis);
    const label = "scorePercent" in shown ? `${shown.scorePercent}% · ${stateLabel(shown)}` : "Analysis complete";
    return (
      <>
        {criteriaCard}
        <JobScanView step="done" goalName={goal?.name} resultLabel={hasCriteria ? label : "Analysis complete"} />
      </>
    );
  }
  return (
    <>
      {criteriaCard}
      {state.aiError && (
        <p className="lw-ai-status">
          AI analysis unavailable ({state.aiError}) — showing what the posting states.{" "}
          <button type="button" className="lw-ai-retry" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      <JobAnalysisView key={state.jobId} analysis={state.analysis} hasCriteria={hasCriteria} />
    </>
  );
}
