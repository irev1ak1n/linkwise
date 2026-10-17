import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LinkedInProfile } from "../models/profile";
import { useStoredPreference } from "../linkedin/panel/useStoredPreference";
import { LoadingView } from "../linkedin/panel/LoadingView";
import { getProfileShell, subscribeProfileShell } from "./profileShellStore";
import { optimizerContextPreference } from "./optimizerPreferences";
import { OptimizerController, buildOptimizerRequest, type OptimizerViewState } from "./optimizerController";
import { readWholeProfile } from "./profileReader";
import { getOptimizerPage, subscribeOptimizerPage } from "./optimizerNav";
import { SectionCards, SectionPage, reconcileAssessments, type SectionContext } from "./SectionPages";
import { buildChecklistRequest, loadChecklist, whenChecklistCacheReady } from "./checklistAssessment";
import { buildSectionRequest, loadSectionAnalysis, whenSectionCacheReady } from "./sectionAnalysis";
import { DETAIL_SECTIONS } from "./sectionGuidance";
import { computeOptimizerScore } from "./score";
import { HeadlineGenerator } from "./HeadlineGenerator";

export const NOT_OWN_PROFILE_MESSAGE = "Profile Optimizer is available on your own LinkedIn profile.";
export const CONTEXT_HELP = "Tell LinkWise about projects, certifications, awards, volunteering, or other experience that is not currently listed.";

interface OptimizerViewProps {
  profileKey: string | null;
  profile: LinkedInProfile | null;
  isFinal: boolean;
  onAnalyzeNow: () => void;
}

export function OptimizerView({ profileKey, profile, isFinal, onAnalyzeNow }: OptimizerViewProps) {
  const shellData = useSyncExternalStore(subscribeProfileShell, getProfileShell, getProfileShell);
  const { value: userContext, loaded: contextLoaded } = useStoredPreference(optimizerContextPreference);
  const [state, setState] = useState<OptimizerViewState>({ status: "idle" });
  const controllerRef = useRef<OptimizerController | null>(null);
  if (!controllerRef.current) controllerRef.current = new OptimizerController({ onChange: setState });

  const shell = shellData && shellData.profileKey === profileKey ? shellData.shell : null;
  const ownProfile = !!shell?.isOwnProfile;
  const pageRead = !!shellData?.complete;
  const ready = ownProfile && pageRead && isFinal && contextLoaded && profileKey !== null && profile !== null;
  const readingFor = useRef<string | null>(null);

  useEffect(() => {
    if (!ownProfile || pageRead || !profileKey || readingFor.current === profileKey) return;
    readingFor.current = profileKey;
    void readWholeProfile();
  }, [ownProfile, pageRead, profileKey]);

  useEffect(() => {
    controllerRef.current!.update(ready ? { profileKey: profileKey!, profile: profile!, shell: shell!, userContext } : null);
  }, [ready, profileKey, profile, shell, userContext]);
  useEffect(() => () => controllerRef.current?.reset(), []);

  const page = useSyncExternalStore(subscribeOptimizerPage, getOptimizerPage, getOptimizerPage);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const homeScroll = useRef(0);
  const lastPage = useRef(page);
  // Returning home restores where the list was; a detail page starts at its top.
  useLayoutEffect(() => {
    const scroller = rootRef.current?.closest(".lw-panel__body");
    if (!scroller) return;
    if (lastPage.current !== page) {
      scroller.scrollTop = page.name === "home" ? homeScroll.current : 0;
      lastPage.current = page;
    }
    if (page.name !== "home") return;
    const remember = () => (homeScroll.current = scroller.scrollTop);
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => scroller.removeEventListener("scroll", remember);
  }, [page, shell !== null && profile !== null]);

  const body = useMemo(
    () => (ready ? buildOptimizerRequest({ profileKey: profileKey!, profile: profile!, shell: shell!, userContext }) : null),
    [ready, profileKey, profile, shell, userContext],
  );

  // Every section's AI checks run once the profile has been read, so opening a page never asks for anything.
  const [, setChecked] = useState(0);
  useEffect(() => {
    if (!body) return;
    let active = true;
    void Promise.all([whenChecklistCacheReady(), whenSectionCacheReady()]).then(() => {
      if (!active) return;
      const jobs: Promise<unknown>[] = DETAIL_SECTIONS.flatMap((section) => {
        const request = buildChecklistRequest(section, body);
        return request ? [loadChecklist(request)] : [];
      });
      const banner = buildSectionRequest("banner", body);
      if (banner.present) jobs.push(loadSectionAnalysis(banner));
      for (const job of jobs) void job.then(() => active && setChecked((n) => n + 1));
    });
    return () => {
      active = false;
    };
  }, [body]);

  if (profileKey === null || (shell !== null && !shell.isOwnProfile)) return <p className="lw-empty">{NOT_OWN_PROFILE_MESSAGE}</p>;
  if (!shell || !profile) return <p className="lw-empty">Loading profile…</p>;

  const context: SectionContext = { profileKey, shell, profile, body, overall: state.status === "ready" ? state.result.sections : [] };
  // The overview's states come from the same checklists as the detail pages.
  const reconciled = reconcileAssessments(context);
  const shownState: OptimizerViewState = state.status === "ready" ? { ...state, result: { ...state.result, sections: reconciled }, score: computeOptimizerScore(state.body.sections, reconciled) } : state;
  if (page.name === "section") {
    return (
      <div className="lw-optimizer" ref={rootRef}>
        <SectionPage key={page.section} section={page.section} context={context} />
      </div>
    );
  }
  if (page.name === "generate") {
    return (
      <div className="lw-optimizer" ref={rootRef}>
        <HeadlineGenerator body={body} currentHeadline={profile.headline ?? ""} />
      </div>
    );
  }

  return (
    <div className="lw-optimizer" ref={rootRef}>
      <ProfileScore state={shownState} onRetry={() => controllerRef.current!.retry()} pageRead={pageRead} isFinal={isFinal} onAnalyzeNow={onAnalyzeNow} />
      <ContextInput committed={userContext} />
      {pageRead && <SectionCards context={context} />}
    </div>
  );
}

function ContextInput({ committed }: { committed: string }) {
  const [text, setText] = useState(committed);
  useEffect(() => setText(committed), [committed]);
  const changed = text.trim() !== committed.trim();
  return (
    <div className="lw-optimizer__context">
      <label className="lw-keywords__label" htmlFor="lw-optimizer-context">
        Anything not on your LinkedIn profile?
      </label>
      <textarea id="lw-optimizer-context" className="lw-keywords__input" rows={2} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
      <p className="lw-scan-mode__hint">{CONTEXT_HELP}</p>
      {changed && (
        <button type="button" className="lw-button lw-button--secondary" onClick={() => optimizerContextPreference.set(text.trim())}>
          Update analysis
        </button>
      )}
    </div>
  );
}

interface ProfileScoreProps {
  state: OptimizerViewState;
  onRetry: () => void;
  pageRead: boolean;
  isFinal: boolean;
  onAnalyzeNow: () => void;
}

// The score and the overall assessment, above the section list.
export function ProfileScore({ state, onRetry, pageRead, isFinal, onAnalyzeNow }: ProfileScoreProps) {
  if (!pageRead) return <LoadingView label="Reading every section of your profile…" />;
  if (!isFinal) {
    return (
      <div className="lw-optimizer__reading">
        <LoadingView label="Reading your profile…" />
        <button type="button" className="lw-button lw-button--secondary" onClick={onAnalyzeNow}>
          Analyze now
        </button>
      </div>
    );
  }
  if (state.status === "idle" || state.status === "loading") return <LoadingView label="Reviewing your profile…" />;
  if (state.status === "unavailable") {
    return (
      <div className="lw-optimizer__error">
        <p className="lw-empty">Profile Optimizer is unavailable right now ({state.reason}).</p>
        <button type="button" className="lw-button lw-button--secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <header className="lw-optimizer__result">
      <div className="lw-optimizer__score">
        <span className="lw-optimizer__score-value">{state.score}</span>
        <span className="lw-optimizer__score-label">/ 100 profile score</span>
      </div>
      {state.result.summary && <p className="lw-optimizer__summary">{state.result.summary}</p>}
      {state.updating && <p className="lw-scan-mode__hint">Updating…</p>}
      {state.updateError && (
        <p className="lw-scan-mode__hint">
          Could not refresh ({state.updateError}).{" "}
          <button type="button" className="lw-scan__link" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
    </header>
  );
}
