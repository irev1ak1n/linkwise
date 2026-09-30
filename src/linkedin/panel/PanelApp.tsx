import { useEffect, useMemo, useState } from "react";
import { useCollectionData } from "./useCollectionData";
import { useGoalStore } from "./useGoalStore";
import { useAiAnalysis } from "./useAiAnalysis";
import { useScanMode } from "./useScanMode";
import { useExpandDetailsPreference } from "./useExpandDetailsPreference";
import { useEnhancedAnalysisPreference } from "./useEnhancedAnalysisPreference";
import { useManualSectionsPreference } from "./useManualSectionsPreference";
import { useJobsSettings } from "./useJobsSettings";
import { useSignalMode } from "./useSignalMode";
import { GoalSetupSection } from "./GoalSetupSection";
import { ScanModeToggle } from "./ScanModeToggle";
import { ExpandDetailsCheckbox } from "./ExpandDetailsCheckbox";
import { EnhancedAnalysisCheckbox } from "./EnhancedAnalysisCheckbox";
import { ManualSectionsCheckbox } from "./ManualSectionsCheckbox";
import { autoExpandPreference } from "./autoExpandPreference";
import { useStoredPreference } from "./useStoredPreference";
import { JobsSettingsSection } from "./JobsSettingsSection";
import { SignalModeSection } from "./SignalModeSection";
import { AutoScrollControls } from "./AutoScrollControls";
import { autoScrollSpeedPreference } from "./autoScrollSpeedPreference";
import { highlightKeywordsPreference } from "./keywordPreference";
import { useAutoScroll } from "./useAutoScroll";
import { ScanningView } from "./ScanningView";
import { LoadingView } from "./LoadingView";
import { AnalysisView } from "./AnalysisView";
import { scoreProfileAgainstGoal } from "../../matching/scoreProfile";
import { isAutomaticScan } from "../../models/scanMode";

interface PanelAppProps {
  onClose: () => void;
}

// The in-page panel's whole UI, the only LinkWise interface. Goal Setup stays usable on any
// page, while the profile section only works on a /in/... profile.
//
// Collection finishes on its own via auto-scroll, so isFinal usually flips true before the
// user does anything. Analysis is AI-first: nothing shows while OpenAI's reasoning is still in
// flight, only a loading state, so there's never a stale or partial result on screen.
export function PanelApp({ onClose }: PanelAppProps) {
  const { profileKey, profile, collection, autoScanProgress, updatingSection } = useCollectionData();
  const { selectedGoal: goal, loaded: goalsLoaded, setActiveGoalCriteria } = useGoalStore();
  const { mode: scanMode, setScanMode } = useScanMode();
  const { enabled: expandDetailsEnabled, setExpandDetailsPreference } = useExpandDetailsPreference();
  const { enabled: enhancedAnalysisEnabled, setEnhancedAnalysisPreference } = useEnhancedAnalysisPreference();
  const { enabled: manualSectionsEnabled, setManualSectionsPreference } = useManualSectionsPreference();
  const { value: autoExpandEnabled } = useStoredPreference(autoExpandPreference);
  const { value: scrollSpeed } = useStoredPreference(autoScrollSpeedPreference);
  const { value: highlightKeywords } = useStoredPreference(highlightKeywordsPreference);
  const { state: autoScroll, pause: pauseAutoScroll, resume: resumeAutoScroll } = useAutoScroll();
  const { settings: jobsSettings, setJobsSettings } = useJobsSettings();
  const signalMode = useSignalMode();
  const [forcedKeys, setForcedKeys] = useState<Set<string>>(new Set());

  const forced = profileKey !== null && forcedKeys.has(profileKey);
  // A multi-page Auto scan overrides the single-page settle check: never final mid-crawl even
  // if the currently-open page has settled, always final once the whole crawl completes.
  const autoScanActive = autoScanProgress?.status === "scanning";
  const autoScanComplete = autoScanProgress?.status === "complete";
  const reachedFinal = forced || autoScanComplete || (!autoScanActive && collection?.status === "settled");
  // Once final, later evidence refreshes the analysis instead of hiding it again.
  const [finalKeys, setFinalKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (reachedFinal && profileKey && !finalKeys.has(profileKey)) setFinalKeys((prev) => new Set(prev).add(profileKey));
  }, [reachedFinal, profileKey, finalKeys]);
  const isFinal = reachedFinal || (profileKey !== null && finalKeys.has(profileKey) && !autoScanActive);

  // Memoized so this stays reference-stable, an unstable one would re-trigger AI on every render.
  const result = useMemo(() => (goal && profile ? scoreProfileAgainstGoal(goal, profile) : null), [goal, profile]);

  const { state: aiState, retry: retryAi } = useAiAnalysis(goal, profile, result, isFinal);

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
          scanMode={scanMode}
          autoScanProgress={autoScanProgress}
          onAnalyzeNow={handleAnalyzeNow}
        />
      );
    }
    if (!result) return null;

    // Settled, but AI hasn't resolved yet, show only a loading state.
    if (aiState.status === "idle") return <LoadingView label="Preparing results…" />;
    if (aiState.status === "loading") {
      const partial = scanMode === "autoScroll" && autoScroll.pausedBy === "user";
      return <LoadingView label={partial ? "Analyzing collected profile information…" : "Analyzing match…"} />;
    }

    return <AnalysisView result={result} goal={goal} profile={profile} aiState={aiState} onRetry={retryAi} updatingSection={updatingSection} />;
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
            <GoalSetupSection goal={goal} profileKey={profileKey} onSetActiveCriteria={setActiveGoalCriteria} />
            {profileKey !== null && <ScanModeToggle mode={scanMode} onChange={setScanMode} />}
            {profileKey !== null && scanMode === "scroll" && (
              <ExpandDetailsCheckbox enabled={expandDetailsEnabled} onChange={setExpandDetailsPreference} />
            )}
            {profileKey !== null && scanMode === "autoScroll" && (
              <AutoScrollControls
                speed={scrollSpeed}
                status={autoScroll.status}
                pausedByUser={autoScroll.pausedBy === "user"}
                analyzing={aiState.status === "loading" || (aiState.status === "ready" && !!aiState.updating)}
                onSpeedChange={autoScrollSpeedPreference.set}
                onPause={pauseAutoScroll}
                onResume={resumeAutoScroll}
              />
            )}
            {profileKey !== null && isAutomaticScan(scanMode) && (
              <ExpandDetailsCheckbox enabled={autoExpandEnabled} onChange={autoExpandPreference.set} hint="Reveal full descriptions while scanning." />
            )}
            {profileKey !== null && scanMode === "auto" && (
              <EnhancedAnalysisCheckbox enabled={enhancedAnalysisEnabled} onChange={setEnhancedAnalysisPreference} />
            )}
            {profileKey !== null && isAutomaticScan(scanMode) && (
              <ManualSectionsCheckbox enabled={manualSectionsEnabled} onChange={setManualSectionsPreference} />
            )}
            {renderProfileSection()}
            {profileKey !== null && (
              <SignalModeSection
                enabled={signalMode.enabled}
                analysis={signalMode.analysis}
                highlighted={signalMode.highlighted}
                onChange={signalMode.setSignalModeEnabled}
                keywords={highlightKeywords}
                onKeywordsChange={highlightKeywordsPreference.set}
                updatingSection={updatingSection}
              />
            )}
            <JobsSettingsSection settings={jobsSettings} onChange={setJobsSettings} />
          </>
        )}
      </div>
    </div>
  );
}
