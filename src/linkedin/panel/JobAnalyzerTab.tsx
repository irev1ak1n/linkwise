import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Goal } from "../../models/goal";
import { JobAnalyzerController, type JobAnalyzerState } from "../../jobs/jobAnalyzerController";
import { STATUS_LABEL, formatCompensation } from "../../jobs/jobAnalysis";
import { requestJobAnalysis } from "../../jobs/jobAnalysisClient";
import { highlightTargets } from "../../jobs/jobHighlightTargets";
import type { JobAnalysis, JobFinding } from "../../jobs/jobTypes";
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

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="lw-opt-block lw-ja-block">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function Findings({ items, empty }: { items: JobFinding[]; empty: string }) {
  if (items.length === 0) return <p className="lw-scan-mode__hint">{empty}</p>;
  return (
    <ul className="lw-opt-tips">
      {items.map((item) => (
        <li key={item.text} title={item.evidence}>
          {item.text}
        </li>
      ))}
    </ul>
  );
}

function Chips({ items, empty }: { items: JobFinding[]; empty: string }) {
  if (items.length === 0) return <p className="lw-scan-mode__hint">{empty}</p>;
  return (
    <p className="lw-ja-chips">
      {items.map((item) => (
        <span key={item.text} className="lw-ja-chip" title={item.evidence}>
          {item.text}
        </span>
      ))}
    </p>
  );
}

export function JobAnalysisView({ analysis, hasCriteria }: { analysis: JobAnalysis; hasCriteria: boolean }) {
  const { job, company, overallMatch } = analysis;
  const facts = [job.location, job.workplaceType && `${job.workplaceType[0]!.toUpperCase()}${job.workplaceType.slice(1)}`, job.employmentType, job.experienceLevel, job.postedDate].filter(Boolean).join(" · ");
  return (
    <div className="lw-ja">
      <div>
        <h3 className="lw-opt-page__title">{job.title || "Job"}</h3>
        <p className="lw-scan-mode__hint">
          {[job.company, facts].filter(Boolean).join(" · ")}
          {!job.workplaceType && " · Workplace not specified"}
        </p>
      </div>

      {hasCriteria && (
        <Block title="Match">
          <p className="lw-ja-score">{overallMatch.disqualified ? "Not a fit" : overallMatch.score === null ? "—" : `${overallMatch.score}% match`}</p>
          <p className="lw-scan-mode__hint">{overallMatch.summary}</p>
          <ul className="lw-opt-tips lw-ja-criteria">
            {analysis.criteriaMatches.map((match) => (
              <li key={match.criterionId} className={`lw-ja-match lw-ja-match--${match.status}`}>
                <strong>{match.criterion}</strong> <span className="lw-ja-status">{STATUS_LABEL[match.status]}</span>
                <span className="lw-ja-reason">{match.reasoning}</span>
                {match.evidence && <em className="lw-ja-evidence">“{match.evidence}”</em>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      <Block title="Key evidence">
        <Findings items={analysis.keyEvidence} empty="Nothing notable stated." />
      </Block>

      <Block title="Compensation">
        <p className="lw-ja-pay">{formatCompensation(analysis.compensation)}</p>
        {analysis.compensation?.other.map((other) => (
          <p key={other.text} className="lw-scan-mode__hint">
            {other.evidence}
          </p>
        ))}
      </Block>

      <Block title="Important details">
        <Findings items={analysis.restrictions} empty="None identified." />
      </Block>

      <Block title="Responsibilities">
        <Findings items={analysis.responsibilities} empty="Not identified." />
      </Block>

      <Block title="Requirements">
        <p className="lw-ja-sub">Required</p>
        <Findings items={analysis.requirements.required} empty="None identified." />
        <p className="lw-ja-sub">Preferred</p>
        <Findings items={analysis.requirements.preferred} empty="None identified." />
        {analysis.education.length > 0 && (
          <>
            <p className="lw-ja-sub">Education</p>
            <Findings items={analysis.education} empty="" />
          </>
        )}
        {analysis.experience.length > 0 && (
          <>
            <p className="lw-ja-sub">Experience</p>
            <Findings items={analysis.experience} empty="" />
          </>
        )}
      </Block>

      <Block title="Skills">
        <p className="lw-ja-sub">Technical</p>
        <Chips items={analysis.skills.technical} empty="None identified." />
        <p className="lw-ja-sub">Professional</p>
        <Chips items={analysis.skills.professional} empty="None identified." />
      </Block>

      <Block title="Benefits">
        <Findings items={analysis.benefits} empty="None identified." />
      </Block>

      <Block title="Company">
        <p className="lw-ja-pay">{company.name || "Not specified"}</p>
        <p className="lw-scan-mode__hint">
          {[company.industry, company.size, company.headquarters, company.followers].filter(Boolean).join(" · ") || "No company details found."}
        </p>
        {company.focus && <p className="lw-scan-mode__hint">{company.focus}</p>}
      </Block>
    </div>
  );
}

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

  if (state.status === "idle" || state.status === "no_job") {
    return (
      <>
        {criteriaCard}
        <p className="lw-empty">Open a LinkedIn job to analyze it. Click a listing in your search results.</p>
      </>
    );
  }
  if (state.status === "reading") {
    return (
      <>
        {criteriaCard}
        <p className="lw-empty">Reading the full job posting…</p>
      </>
    );
  }
  return (
    <>
      {criteriaCard}
      {state.status === "analyzing" && <p className="lw-scan-mode__hint">Analyzing with AI… what the posting states plainly is shown below.</p>}
      {state.status === "ready" && state.aiError && (
        <p className="lw-scan-mode__hint">
          AI analysis unavailable ({state.aiError}). Showing what the posting states.{" "}
          <button type="button" className="lw-opt-back" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      <JobAnalysisView key={state.jobId} analysis={state.analysis} hasCriteria={hasCriteria} />
    </>
  );
}
