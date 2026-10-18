import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import { JobFiltersPage } from "./JobFiltersPage";
import { SignalModeSection } from "./SignalModeSection";
import { FocusOnSection } from "./FocusOnSection";
import { SettingsPage } from "./SettingsPage";
import { highlightKeywordsPreference } from "./keywordPreference";
import { highlightColorPreference } from "./highlightColorPreference";
import { keywordColorPreference } from "./keywordColorPreference";
import { ScannerView } from "./ScannerView";
import { deriveScanState } from "./scanProgress";
import { useScanHandoff } from "./useScanHandoff";
import { isProfileSectionHeading } from "../profileAdapter";
import { matchDisplayLabel, matchDisplayState } from "../../matching/matchColors";
import { AnalysisView } from "./AnalysisView";
import { getAnalyzerPage, subscribeAnalyzerPage, syncAnalyzerProfile } from "./analyzerNav";
import { scoreProfileAgainstGoal } from "../../matching/scoreProfile";
import { OptimizerView } from "../../optimizer/OptimizerView";
import { panelToolPreference } from "../../optimizer/optimizerPreferences";
import { getOptimizerPage, subscribeOptimizerPage } from "../../optimizer/optimizerNav";
import { SavedProfilesView } from "../../savedProfiles/SavedProfilesView";
import { getSavedPage, subscribeSavedPage } from "../../savedProfiles/savedNav";
import { BackLink, BrandMark, HeaderSignalLines, MainMenu, ToolHead } from "./MainMenu";

const openMenu = () => panelToolPreference.set("menu");

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
  const { value: highlightKeywords } = useStoredPreference(highlightKeywordsPreference);
  const { value: highlightColor } = useStoredPreference(highlightColorPreference);
  const { value: keywordColor } = useStoredPreference(keywordColorPreference);
  const { settings: jobsSettings, setJobsSettings } = useJobsSettings();
  const signalMode = useSignalMode();
  const { value: tool } = useStoredPreference(panelToolPreference);
  const optimizerPage = useSyncExternalStore(subscribeOptimizerPage, getOptimizerPage, getOptimizerPage);
  const savedPage = useSyncExternalStore(subscribeSavedPage, getSavedPage, getSavedPage);
  const [forcedKeys, setForcedKeys] = useState<Set<string>>(new Set());
  const analyzerPage = useSyncExternalStore(subscribeAnalyzerPage, getAnalyzerPage, getAnalyzerPage);
  useEffect(() => syncAnalyzerProfile(profileKey), [profileKey]);

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

  const { state: aiState, retry: retryAi } = useAiAnalysis(goal, profile, result, isFinal && tool !== "optimizer");

  const scanState =
    profile && collection
      ? deriveScanState({
          mode: scanMode,
          collection,
          profile,
          autoScanProgress,
          analyzing: isFinal && (aiState.status === "idle" || aiState.status === "loading"),
          done: isFinal && (aiState.status === "ready" || aiState.status === "unavailable"),
        })
      : null;
  // Auto scan reports progress on its own; in scroll mode a quiet page just means the user is reading.
  const scanSignature = scanState ? `${scanState.progress}|${scanState.active?.section ?? ""}|${collection?.lastChangedAt ?? 0}` : null;
  const handoff = useScanHandoff(profileKey, scanState?.status ?? null, scanMode === "auto" ? scanSignature : null);
  const scanFailed = handoff.stalled && scanState?.status === "scanning";

  const analysisReady = profileKey !== null && !!profile && !!collection && !!goal && isFinal && !!result && (aiState.status === "ready" || aiState.status === "unavailable");

  function handleAnalyzeNow(): void {
    if (!profileKey) return;
    setForcedKeys((prev) => new Set(prev).add(profileKey));
  }

  // How LinkWise scans and highlights profiles, set once in Settings.
  const highlights = (
      <SignalModeSection
        enabled={signalMode.enabled}
        highlighted={signalMode.highlighted}
        onChange={signalMode.setSignalModeEnabled}
        keywords={highlightKeywords}
        color={highlightColor}
        onColorChange={highlightColorPreference.set}
        keywordColor={keywordColor}
        onKeywordColorChange={keywordColorPreference.set}
      />
    );

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
    if (!result || !scanState) return null;
    // The scan screen covers collection and the analysis request, then hands over to the results.
    if (!isFinal || aiState.status === "idle" || aiState.status === "loading" || handoff.showingComplete) {
      const final = aiState.status === "ready" ? matchDisplayState(aiState.outcome.result) : null;
      return (
        <ScannerView
          key={profileKey}
          profileName={isProfileSectionHeading(profile.name) ? undefined : profile.name}
          goalName={goal.name}
          scanMode={scanMode}
          state={scanFailed ? { ...scanState, status: "error", message: "Could not finish scanning" } : scanState}
          resultLabel={final ? `${"scorePercent" in final ? `${final.scorePercent}% · ` : ""}${matchDisplayLabel(final)}` : undefined}
          onAnalyzeNow={handleAnalyzeNow}
          onRetry={() => location.reload()}
        />
      );
    }

    return <AnalysisView profileKey={profileKey} result={result} goal={goal} profile={profile} aiState={aiState} onRetry={retryAi} updatingSection={updatingSection} signalAnalysis={signalMode.analysis} />;
  }

  return (
    <div className="lw-panel">
      <header className="lw-panel__header">
        <HeaderSignalLines />
        <span className="lw-panel__brand">
          <BrandMark />
          <span className="lw-panel__wordmark">
            Link<span>Wise</span>
          </span>
        </span>
        <button type="button" className="lw-panel__close" aria-label="Close LinkWise panel" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="lw-panel__body">
        {tool === "menu" ? (
          <MainMenu onOpen={panelToolPreference.set} />
        ) : tool === "settings" ? (
          <SettingsPage
            highlights={highlights}
            scanning={
              <>
                <ScanModeToggle mode={scanMode} onChange={setScanMode} />
                {scanMode === "scroll" && <ExpandDetailsCheckbox enabled={expandDetailsEnabled} onChange={setExpandDetailsPreference} />}
                {scanMode === "auto" && (
                  <ExpandDetailsCheckbox enabled={autoExpandEnabled} onChange={autoExpandPreference.set} hint="Reveal full descriptions while scanning." />
                )}
                {scanMode === "auto" && <EnhancedAnalysisCheckbox enabled={enhancedAnalysisEnabled} onChange={setEnhancedAnalysisPreference} />}
                {scanMode === "auto" && <ManualSectionsCheckbox enabled={manualSectionsEnabled} onChange={setManualSectionsPreference} />}
              </>
            }
          />
        ) : tool === "saved" ? (
          <>
            {savedPage.page === "list" && <BackLink label="Back to Menu" onClick={openMenu} />}
            <SavedProfilesView />
          </>
        ) : tool === "jobs" ? (
          <JobFiltersPage settings={jobsSettings} onChange={setJobsSettings} onBack={openMenu} />
        ) : tool === "optimizer" ? (
          <>
            {optimizerPage.name === "home" && <ToolHead title="Profile Optimizer" />}
            <OptimizerView profileKey={profileKey} profile={profile} isFinal={isFinal} onAnalyzeNow={handleAnalyzeNow} />
          </>
        ) : !goalsLoaded ? (
          <p className="lw-empty">Loading your goals…</p>
        ) : analysisReady && analyzerPage !== "home" ? (
          renderProfileSection()
        ) : (
          <>
            <ToolHead title="Profile Analyzer" subtitle="Get insights and actionable tips for any LinkedIn profile." decorated />
            <GoalSetupSection goal={goal} profileKey={profileKey} onSetActiveCriteria={setActiveGoalCriteria} />
            <FocusOnSection keywords={highlightKeywords} onSave={highlightKeywordsPreference.set} />
            {renderProfileSection()}
          </>
        )}
      </div>
    </div>
  );
}
