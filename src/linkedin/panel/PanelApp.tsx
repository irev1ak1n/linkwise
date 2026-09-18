import { useEffect, useMemo, useState } from "react";
import { useCollectionData } from "./useCollectionData";
import { useGoalStore } from "./useGoalStore";
import { useAiAnalysis } from "./useAiAnalysis";
import { GoalSetupSection } from "./GoalSetupSection";
import { LoadingView } from "./LoadingView";
import { AnalysisFailedView } from "./AnalysisFailedView";
import { NotEnoughInfoView } from "./NotEnoughInfoView";
import { AnalysisView } from "./AnalysisView";
import { scoreProfileAgainstGoal } from "../../matching/scoreProfile";
import { computeAnalysisPipelineStage } from "./analysisPipeline";
import { ensureActiveGoalCriteria } from "./goalStore";

interface PanelAppProps {
  onClose: () => void;
}

/** How long the whole invisible pipeline (scan settling, criteria repair, local scoring, AI
 * analysis) is allowed to sit in a loading stage before giving up and offering Retry — well
 * above the product's own "~10-15 seconds" typical-case target (background scan + criteria
 * repair run in parallel, so the common case finishes well inside this), but bounded so a
 * genuinely stuck pipeline never spins forever with no way out. */
const PIPELINE_TIMEOUT_MS = 30000;

/**
 * The in-page LinkWise panel's whole UI — the ONLY LinkWise interface; there is no separate
 * browser side panel anymore. The opener (and this panel) mount on every LinkedIn page, but
 * `profileKey` is only ever non-null while the current URL is a `/in/...` profile (see
 * collectionEngine.ts's `onLeaveProfile`) — everywhere else the profile section shows a plain
 * neutral state, while Goal Setup (describe who you're looking for, then let LinkWise turn it
 * into criteria) stays fully usable regardless of what page you're on.
 *
 * The profile-analysis section itself is an invisible-until-complete pipeline, not a two-stage
 * "provisional score then AI-enhanced score" reveal: nothing is shown — no percentage, no
 * summary, no strengths/gaps — until the background scan has settled, usable criteria exist
 * (auto-repairing themselves if they don't — see goalStore.ts's `ensureActiveGoalCriteria`), the
 * deterministic score has been computed, AND the AI-enhanced analysis has resolved one way or
 * the other (ready or genuinely unavailable). Every step before that renders through the exact
 * same `LoadingView`, cycling only its label (see analysisPipeline.ts, the pure function that
 * decides which of those stages applies on every render). This is a deliberate product decision:
 * a provisional 0% or a partial summary reads as a real result to the user, and LinkWise would
 * rather show one honest wait than several dishonest-looking partial ones.
 */
export function PanelApp({ onClose }: PanelAppProps) {
  const { profileKey, profile, collection } = useCollectionData();
  const { selectedGoal: goal, loaded: goalsLoaded, setActiveGoalCriteria, rememberGoalDescription } = useGoalStore();

  // Memoized so this stays REFERENCE-STABLE across re-renders whenever goal/profile haven't
  // actually changed — useAiAnalysis's effect depends on it, and an unstable reference here
  // would re-trigger (and re-debounce) an AI request on every unrelated re-render.
  const result = useMemo(() => (goal && profile ? scoreProfileAgainstGoal(goal, profile) : null), [goal, profile]);

  // AI is only worth asking for once there is a real, non-null percentage to enhance — a goal
  // with no criteria yet, or a profile with no extracted evidence, has nothing for it to
  // improve on, and a goal that's deliberately all-EXCLUDED has no positive score to narrate.
  const aiExpected =
    profile !== null &&
    collection?.status === "settled" &&
    goal !== null &&
    goal.criteria.length > 0 &&
    profile.extracted &&
    result !== null &&
    result.scorePercent !== null;

  const [retryToken, setRetryToken] = useState(0);
  const aiState = useAiAnalysis(goal, profile, result, aiExpected, retryToken);

  // The overall "give up and offer Retry" clock — one per (profile, goal) pipeline instance, and
  // per explicit retry. Never shared across a profile or goal switch: a fresh pipeline always
  // gets its own full budget rather than inheriting however much time a previous one had left.
  const pipelineKey = `${profileKey ?? "none"}::${goal?.id ?? "none"}::${retryToken}`;
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (profileKey === null || goal === null) return;
    const timer = setTimeout(() => setTimedOut(true), PIPELINE_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // Deliberately keyed on the composite `pipelineKey`, not its individual parts — see above.
  }, [pipelineKey, profileKey, goal]);

  function handleRetry(): void {
    setTimedOut(false);
    setRetryToken((n) => n + 1);
    // Bypasses the repair cooldown for this one explicit, user-initiated attempt — a goal stuck
    // on an empty criteria array is the most common reason the pipeline would ever time out.
    ensureActiveGoalCriteria(Date.now, true);
  }

  function renderProfileSection() {
    if (profileKey === null) {
      return <p className="lw-empty">Open a LinkedIn profile to analyze it.</p>;
    }
    if (!goal) {
      return <p className="lw-empty">No active goal set yet — describe who you're looking for above.</p>;
    }

    const stage = computeAnalysisPipelineStage({ profile, collection, goal, result, aiState, aiExpected, timedOut });
    switch (stage.kind) {
      case "loading":
        return <LoadingView label={stage.label} />;
      case "failed":
        return <AnalysisFailedView onRetry={handleRetry} />;
      case "not_enough_info":
        return <NotEnoughInfoView goalName={goal.name} />;
      case "ready":
        return <AnalysisView result={stage.result} goal={goal} profile={profile!} aiState={stage.aiState} />;
    }
  }

  return (
    <div className="lw-panel">
      <header className="lw-panel__header">
        <span className="lw-panel__brand">LinkWise</span>
        <button type="button" className="lw-panel__close" aria-label="Close LinkWise panel" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="lw-panel__body">
        {!goalsLoaded ? (
          <p className="lw-empty">Loading your goals…</p>
        ) : (
          <>
            <GoalSetupSection goal={goal} onSetActiveCriteria={setActiveGoalCriteria} onRememberDescription={rememberGoalDescription} />
            {renderProfileSection()}
          </>
        )}
      </div>
    </div>
  );
}
