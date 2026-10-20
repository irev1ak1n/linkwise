import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LinkedInProfile } from "../models/profile";
import { useStoredPreference } from "../linkedin/panel/useStoredPreference";
import { LoadingView } from "../linkedin/panel/LoadingView";
import { getProfileShell, subscribeProfileShell } from "./profileShellStore";
import { optimizerContextPreference } from "./optimizerPreferences";
import { OptimizerController, buildOptimizerRequest, type OptimizerViewState } from "./optimizerController";
import { readWholeProfile } from "./profileReader";
import { getOptimizerPage, openOptimizerPage, subscribeOptimizerPage } from "./optimizerNav";
import { Chevron, SectionCards, SectionPage, reconcileAssessments, type SectionContext } from "./SectionPages";
import { buildChecklistRequest, loadChecklist, whenChecklistCacheReady } from "./checklistAssessment";
import { buildSectionRequest, loadSectionAnalysis, whenSectionCacheReady } from "./sectionAnalysis";
import { DETAIL_SECTIONS, SECTION_GUIDANCE } from "./sectionGuidance";
import { computeOptimizerScore, scoreBand } from "./score";
import { SECTION_GROUPS, type OptimizerSection } from "./sections";
import type { SectionAssessmentDTO } from "./optimizerTypes";
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

  // Read again whenever the profile isn't fully read, e.g. after visiting another profile replaced its reading.
  useEffect(() => {
    if (!ownProfile || pageRead || !profileKey || readingFor.current === profileKey) return;
    readingFor.current = profileKey;
    void readWholeProfile().finally(() => {
      if (readingFor.current === profileKey) readingFor.current = null;
    });
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
      {shownState.status === "ready" && <TopPriorities sections={shownState.result.sections} />}
      <ContextInput committed={userContext} />
      {pageRead && <SectionCards context={context} />}
    </div>
  );
}

// What the user tells LinkWise themselves. It stays their own context: the analysis is told it did
// not come from LinkedIn, and nothing here is shown as if it were found on the profile.
function ContextInput({ committed }: { committed: string }) {
  const [text, setText] = useState(committed);
  useEffect(() => setText(committed), [committed]);
  const changed = text.trim() !== committed.trim();
  return (
    <section className="lw-opt-block-card lw-optimizer__context" aria-label="Additional context">
      <h4 className="lw-opt-group__title">Additional context</h4>
      <label className="lw-opt-context__label" htmlFor="lw-optimizer-context">
        Anything not on your LinkedIn profile?
      </label>
      <textarea id="lw-optimizer-context" className="lw-opt-context__input" rows={2} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
      <p className="lw-opt-context__help">{CONTEXT_HELP}</p>
      {changed && (
        <button type="button" className="lw-button lw-button--secondary" onClick={() => optimizerContextPreference.set(text.trim())}>
          Update analysis
        </button>
      )}
    </section>
  );
}

const IMPACT_RANK = { high: 0, medium: 1, low: 2 } as const;
const IMPACT_TEXT = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;
const LISTED_SECTIONS = new Set<OptimizerSection>(SECTION_GROUPS.flatMap((group) => group.sections));

/** The few sections worth doing first: from the review's own section states and impacts, never a
 * new request. Missing or improvable sections, highest impact first, then in profile order. */
export function topPriorities(sections: SectionAssessmentDTO[], limit = 3): SectionAssessmentDTO[] {
  return sections
    .map((assessment, index) => ({ assessment, index }))
    .filter(({ assessment }) => assessment.state !== "strong" && LISTED_SECTIONS.has(assessment.section))
    .sort((a, b) => IMPACT_RANK[a.assessment.impact] - IMPACT_RANK[b.assessment.impact] || a.index - b.index)
    .slice(0, limit)
    .map(({ assessment }) => assessment);
}

export function TopPriorities({ sections }: { sections: SectionAssessmentDTO[] }) {
  const top = topPriorities(sections);
  if (top.length === 0) return null;
  return (
    <section className="lw-opt-groups lw-opt-priorities" aria-label="Top priorities">
      <h4 className="lw-opt-group__title">Top priorities</h4>
      <ol className="lw-opt-cards">
        {top.map((assessment, i) => {
          const title = SECTION_GUIDANCE[assessment.section].title;
          return (
            <li key={assessment.section}>
              <button type="button" className="lw-opt-card" onClick={() => openOptimizerPage({ name: "section", section: assessment.section })}>
                <span className="lw-opt-priority__rank" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="lw-opt-card__text">
                  <span className="lw-opt-card__title">{assessment.state === "add" ? `Add ${title}` : `Improve ${title}`}</span>
                  <span className="lw-opt-card__subtitle">{IMPACT_TEXT[assessment.impact]}</span>
                </span>
                <Chevron />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// The review's summary at a glance: its first few sentences, with the rest a tap away.
const SUMMARY_SENTENCES = 2;
function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function ConciseSummary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const sentences = splitSentences(text);
  const long = sentences.length > SUMMARY_SENTENCES;
  return (
    <>
      <p className="lw-optimizer__summary">{open || !long ? text : sentences.slice(0, SUMMARY_SENTENCES).join(" ")}</p>
      {long && (
        <button type="button" className="lw-scan__link lw-opt-score__more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Show less" : "Show full analysis"}
        </button>
      )}
    </>
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
    <header className="lw-opt-block-card lw-optimizer__result" aria-label="Profile score">
      <h4 className="lw-opt-group__title">Profile score</h4>
      <div className="lw-optimizer__score">
        <span className="lw-optimizer__score-value">{state.score}</span>
        <span className="lw-optimizer__score-label">/ 100</span>
        <span className="lw-optimizer__band">{scoreBand(state.score)}</span>
      </div>
      {state.result.summary && <ConciseSummary text={state.result.summary} />}
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
