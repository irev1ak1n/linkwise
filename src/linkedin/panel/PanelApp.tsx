import { useMemo, useState } from "react";
import { useCollectionData } from "./useCollectionData";
import { useGoalStore } from "./useGoalStore";
import { useAiAnalysis } from "./useAiAnalysis";
import { GoalSetupSection } from "./GoalSetupSection";
import { ScanningView } from "./ScanningView";
import { AnalysisView } from "./AnalysisView";
import { scoreProfileAgainstGoal } from "../../matching/scoreProfile";

interface PanelAppProps {
  onClose: () => void;
}

/**
 * The in-page LinkWise panel's whole UI — the ONLY LinkWise interface; there is no separate
 * browser side panel anymore. The opener (and this panel) mount on every LinkedIn page, but
 * `profileKey` is only ever non-null while the current URL is a `/in/...` profile (see
 * collectionEngine.ts's `onLeaveProfile`) — everywhere else the profile section shows a plain
 * neutral state rather than pretending there's a profile to analyze, while Goal Setup (describe
 * who you're looking for, then let LinkWise turn it into criteria) stays fully usable regardless
 * of what page you're on. On a profile, the profile section is exactly two states: Scanning
 * (collection incomplete) and Analysis (collection settled) — never a third "in-between" view,
 * and never a final score shown while still Scanning.
 *
 * Collection itself now finishes on its own: content.ts scrolls the page automatically (see
 * autoScroll.ts) whenever a profile opens with an active goal, so `isFinal` below almost always
 * flips to true from `collection.status === "settled"` well before the user does anything —
 * `forced` (via the Scanning view's own manual override) still exists purely as a fallback for
 * the rare page collection can't finish quickly on its own, never as a required step.
 *
 * Analysis itself is two-layered: the deterministic local result renders immediately (as always
 * — LinkWise is never unusable without AI), while `useAiAnalysis` asks the backend's OpenAI
 * reasoning layer to improve on it in the background. AnalysisView shows the local result right
 * away and swaps in the AI-enhanced one the moment it's ready, never blocking or freezing the
 * page in between.
 */
export function PanelApp({ onClose }: PanelAppProps) {
  const { profileKey, profile, collection } = useCollectionData();
  const { selectedGoal: goal, loaded: goalsLoaded, setActiveGoalCriteria } = useGoalStore();
  const [forcedKeys, setForcedKeys] = useState<Set<string>>(new Set());

  const forced = profileKey !== null && forcedKeys.has(profileKey);
  const isFinal = forced || collection?.status === "settled";

  // Memoized so this stays REFERENCE-STABLE across re-renders whenever goal/profile haven't
  // actually changed — useAiAnalysis's effect depends on it, and an unstable reference here
  // would re-trigger (and re-debounce) an AI request on every unrelated re-render.
  const result = useMemo(() => (goal && profile ? scoreProfileAgainstGoal(goal, profile) : null), [goal, profile]);

  const aiState = useAiAnalysis(goal, profile, result, isFinal);

  function handleAnalyzeNow(): void {
    if (!profileKey) return;
    setForcedKeys((prev) => new Set(prev).add(profileKey));
  }

  function renderProfileSection() {
    if (profileKey === null) {
      return <p className="lw-empty">Open a LinkedIn profile to analyze it.</p>;
    }
    if (!profile || !collection) {
      return <p className="lw-empty">Loading profile…</p>;
    }
    if (!goal) {
      return <p className="lw-empty">No active goal set yet — describe who you're looking for above.</p>;
    }
    if (!isFinal) {
      return (
        <ScanningView
          profileName={profile.name}
          goalName={goal.name}
          collection={collection}
          onAnalyzeNow={handleAnalyzeNow}
        />
      );
    }
    if (result) {
      return <AnalysisView result={result} goal={goal} profile={profile} aiState={aiState} />;
    }
    return null;
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
            <GoalSetupSection goal={goal} onSetActiveCriteria={setActiveGoalCriteria} />
            {renderProfileSection()}
          </>
        )}
      </div>
    </div>
  );
}
