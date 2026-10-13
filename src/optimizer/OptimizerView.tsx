import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { LinkedInProfile } from "../models/profile";
import { useStoredPreference } from "../linkedin/panel/useStoredPreference";
import { LoadingView } from "../linkedin/panel/LoadingView";
import { getProfileShell, subscribeProfileShell } from "./profileShellStore";
import { optimizerContextPreference } from "./optimizerPreferences";
import { OptimizerController, buildOptimizerRequest, type OptimizerReady, type OptimizerViewState } from "./optimizerController";
import { requestOptimizerDraft } from "./optimizerClient";
import { readWholeProfile } from "./profileReader";
import { getOptimizerPage, subscribeOptimizerPage } from "./optimizerNav";
import { SectionCards, SectionPage, type SectionContext } from "./SectionPages";
import { HeadlineGenerator } from "./HeadlineGenerator";
import { copyText } from "./copyText";
import { sectionInfo } from "./sections";
import type { DraftSection, OptimizerImpact, OptimizerSource, OptimizerState, SectionAssessmentDTO } from "./optimizerTypes";

export const NOT_OWN_PROFILE_MESSAGE = "Profile Optimizer is available on your own LinkedIn profile.";
export const CONTEXT_HELP = "Tell LinkWise about projects, certifications, awards, volunteering, or other experience that is not currently listed.";

type Filter = "all" | OptimizerState;
const FILTERS: { filter: Filter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "add", label: "Add" },
  { filter: "improve", label: "Improve" },
  { filter: "strong", label: "Strong" },
];
const STATE_LABEL: Record<OptimizerState, string> = { add: "Add", improve: "Improve", strong: "Strong" };
const IMPACT_LABEL: Record<OptimizerImpact, string> = { high: "High impact", medium: "Medium impact", low: "Low impact" };
const SOURCE_LABEL: Record<OptimizerSource, string> = {
  linkedin_profile: "Based on your LinkedIn profile",
  user_context: "Based on what you told LinkWise, not on LinkedIn",
  general_best_practice: "General best practice",
};
const IMPACT_RANK: Record<OptimizerImpact, number> = { high: 0, medium: 1, low: 2 };

export function sortAssessments(sections: SectionAssessmentDTO[]): SectionAssessmentDTO[] {
  const rank = (a: SectionAssessmentDTO) => (a.state === "strong" ? 3 : IMPACT_RANK[a.impact]);
  return [...sections].sort((a, b) => rank(a) - rank(b));
}

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

  if (profileKey === null || (shell !== null && !shell.isOwnProfile)) return <p className="lw-empty">{NOT_OWN_PROFILE_MESSAGE}</p>;
  if (!shell || !profile) return <p className="lw-empty">Loading profile…</p>;

  const context: SectionContext = { shell, profile, body, overall: state.status === "ready" ? state.result.sections : [] };
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
      <ContextInput committed={userContext} />
      {pageRead && <SectionCards context={context} />}
      {!pageRead ? (
        <LoadingView label="Reading every section of your profile…" />
      ) : !isFinal ? (
        <div className="lw-optimizer__reading">
          <LoadingView label="Reading your profile…" />
          <button type="button" className="lw-button lw-button--secondary" onClick={onAnalyzeNow}>
            Analyze now
          </button>
        </div>
      ) : (
        <OptimizerResult state={state} onRetry={() => controllerRef.current!.retry()} userContext={userContext} />
      )}
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
      <textarea id="lw-optimizer-context" className="lw-keywords__input" rows={3} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
      <p className="lw-scan-mode__hint">{CONTEXT_HELP}</p>
      {changed && (
        <button type="button" className="lw-button lw-button--secondary" onClick={() => optimizerContextPreference.set(text.trim())}>
          Update analysis
        </button>
      )}
    </div>
  );
}

interface OptimizerResultProps {
  state: OptimizerViewState;
  onRetry: () => void;
  userContext: string;
}

export function OptimizerResult({ state, onRetry, userContext }: OptimizerResultProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

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

  const sections = sortAssessments(state.result.sections);
  const shown = filter === "all" ? sections : sections.filter((s) => s.state === filter);
  return (
    <div className="lw-optimizer__result">
      <div className="lw-optimizer__score">
        <span className="lw-optimizer__score-value">{state.score}</span>
        <span className="lw-optimizer__score-label">/ 100 profile score</span>
      </div>
      {state.result.summary && <p className="lw-optimizer__summary">{state.result.summary}</p>}
      {state.updating && <p className="lw-scan-mode__hint">Updating…</p>}
      {state.updateError && (
        <>
          <p className="lw-scan-mode__hint">Could not refresh ({state.updateError}).</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={onRetry}>
            Try again
          </button>
        </>
      )}
      <div className="lw-scan-mode__control" role="radiogroup" aria-label="Filter recommendations">
        {FILTERS.map((option) => (
          <button
            key={option.filter}
            type="button"
            role="radio"
            aria-checked={filter === option.filter}
            className={`lw-scan-mode__option${filter === option.filter ? " is-active" : ""}`}
            onClick={() => setFilter(option.filter)}
          >
            {option.label} ({option.filter === "all" ? sections.length : sections.filter((s) => s.state === option.filter).length})
          </button>
        ))}
      </div>
      <ul className="lw-optimizer__rows">
        {shown.map((assessment) => (
          <li key={assessment.section} className="lw-optimizer__row">
            <button type="button" className="lw-optimizer__row-head" aria-expanded={open === assessment.section} onClick={() => setOpen(open === assessment.section ? null : assessment.section)}>
              <span className="lw-optimizer__row-label">{sectionInfo(assessment.section).label}</span>
              <span className={`lw-optimizer__badge is-${assessment.state}`}>{STATE_LABEL[assessment.state]}</span>
              {assessment.state !== "strong" && <span className={`lw-optimizer__impact is-${assessment.impact}`}>{IMPACT_LABEL[assessment.impact]}</span>}
            </button>
            {open === assessment.section && <SectionDetails assessment={assessment} ready={state} userContext={userContext} />}
          </li>
        ))}
        {shown.length === 0 && <li className="lw-empty">Nothing here.</li>}
      </ul>
    </div>
  );
}

function SectionDetails({ assessment, ready, userContext }: { assessment: SectionAssessmentDTO; ready: OptimizerReady; userContext: string }) {
  const info = sectionInfo(assessment.section);
  const evidence = ready.body.profile.evidence;
  const entries =
    assessment.section === "experience"
      ? [...new Set([...assessment.evidenceIds, ...evidence.map((e) => e.id)])].filter((id) => id.startsWith("experience:")).slice(0, 3)
      : [];
  return (
    <div className="lw-optimizer__details">
      <p>{assessment.reason}</p>
      {assessment.suggestions.length > 0 && (
        <ul className="lw-optimizer__suggestions">
          {assessment.suggestions.map((suggestion) => (
            <li key={suggestion}>{suggestion}</li>
          ))}
        </ul>
      )}
      <p className={`lw-optimizer__source is-${assessment.sourceType}`}>{SOURCE_LABEL[assessment.sourceType]}</p>
      {info.draftable && assessment.state !== "strong" && (
        <>
          {assessment.section === "experience" ? (
            entries.map((id) => (
              <DraftBox key={id} ready={ready} assessment={assessment} section="experience" evidenceId={id} userContext={userContext} label={`Draft for ${(evidence.find((e) => e.id === id)?.text ?? id).split(" — ")[0]}`} />
            ))
          ) : (
            <DraftBox ready={ready} assessment={assessment} section={assessment.section as DraftSection} evidenceId={null} userContext={userContext} label="Generate improved draft" />
          )}
        </>
      )}
    </div>
  );
}

type DraftState = { status: "idle" } | { status: "loading" } | { status: "ready"; draft: string } | { status: "unavailable"; reason: string };
const draftMemory = new Map<string, string>();

interface DraftBoxProps {
  ready: OptimizerReady;
  assessment: SectionAssessmentDTO;
  section: DraftSection;
  evidenceId: string | null;
  userContext: string;
  label: string;
}

function DraftBox({ ready, assessment, section, evidenceId, userContext, label }: DraftBoxProps) {
  const memoryKey = `${ready.key}:${section}:${evidenceId ?? ""}`;
  const remembered = draftMemory.get(memoryKey);
  const [draft, setDraft] = useState<DraftState>(remembered ? { status: "ready", draft: remembered } : { status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  function generate(): void {
    setDraft({ status: "loading" });
    const pending = requestOptimizerDraft({
      profile: ready.body.profile,
      section,
      evidenceId,
      guidance: [assessment.reason, ...assessment.suggestions].join("\n"),
      userContext,
    });
    cancelRef.current = pending.cancel;
    void pending.promise.then((outcome) => {
      cancelRef.current = null;
      if (outcome.status === "ok") draftMemory.set(memoryKey, outcome.draft);
      setDraft(outcome.status === "ok" ? { status: "ready", draft: outcome.draft } : { status: "unavailable", reason: outcome.reason });
    });
  }

  return (
    <div className="lw-optimizer__draft">
      {draft.status !== "ready" && (
        <button type="button" className="lw-button lw-button--secondary" disabled={draft.status === "loading"} onClick={generate}>
          {draft.status === "loading" ? "Writing draft…" : label}
        </button>
      )}
      {draft.status === "unavailable" && (
        <p className="lw-scan-mode__hint">{draft.reason === "ungrounded_draft" ? "The draft mentioned things not on your profile, so it was discarded. Try again." : `Draft unavailable (${draft.reason}).`}</p>
      )}
      {draft.status === "ready" && (
        <>
          <textarea className="lw-keywords__input" readOnly rows={section === "headline" ? 2 : 8} value={draft.draft} />
          <p className="lw-scan-mode__hint">A draft for you to review. LinkWise never changes your profile.</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={() => void copyText(draft.draft)}>
            Copy draft
          </button>
        </>
      )}
    </div>
  );
}
