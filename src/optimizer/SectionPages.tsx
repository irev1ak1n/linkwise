import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LinkedInProfile } from "../models/profile";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { buildEvidencePayload } from "../ai/evidencePayload";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import { SECTION_GUIDANCE, DETAIL_SECTIONS } from "./sectionGuidance";
import { neighborSections, openOptimizerPage } from "./optimizerNav";
import { buildSectionRequest, cachedSectionAnalysis } from "./sectionAnalysis";
import { buildChecklistRequest, cachedChecklist, partialList, useChecklistAssessment } from "./checklistAssessment";
import {
  NO_SECTION_TEXT,
  SETTING_SECTIONS,
  evaluateChecklist,
  semanticCriteria,
  summarizeChecklist,
  type ChecklistContext,
  type ChecklistState,
  type ChecklistSummary,
  type EvaluatedCriterion,
  type SemanticState,
} from "./checklist";
import { sectionActions } from "./sectionActions";
import { setManualAnswer } from "./manualChecks";
import { MAX_SECTION_NOTE_CHARS, sectionNotesPreference, setSectionNote } from "./sectionNotes";
import { useStoredPreference } from "../linkedin/panel/useStoredPreference";
import { SectionDrafts } from "./SectionDrafts";
import { missingRelevance, type ChecklistRatios } from "./score";
import { OPTIMIZER_SECTIONS, SECTION_GROUPS, buildSectionMap, sectionInfo, type OptimizerSection, type SectionPresence } from "./sections";
import type { SectionAssessmentDTO } from "./optimizerTypes";

// What the overview row and the detail page both show for a section. "review": nothing is wrong so
// far, but some checks are waiting for the user.
export type DisplayStatus = "strong" | "improve" | "add" | "review" | "partial" | "unverifiable";
export const STATUS_LABEL: Record<DisplayStatus, string> = { strong: "Looking Good", improve: "Needs Improvement", add: "Missing", review: "Needs your review", partial: "Partly verified", unverifiable: "Can't verify" };
const IMPACT_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;

export interface SectionContext {
  profileKey?: string | null;
  shell: ProfileShell;
  profile: LinkedInProfile;
  // Null until the profile has been fully read, which AI analysis needs.
  body: OptimizeProfileRequestBody | null;
  overall: SectionAssessmentDTO[];
  /** The user's answers to checks only they can make, already matched to the current photo and banner. */
  answers?: Record<string, boolean>;
  /** True while the whole-profile analysis is running (a saved note triggers exactly one). */
  analyzing?: boolean;
}

function presenceOf(section: OptimizerSection, context: SectionContext): { presence: SectionPresence; checklist: ChecklistContext } {
  const evidence = context.body?.profile.evidence ?? buildEvidencePayload(context.profile);
  const sections = context.body?.sections ?? buildSectionMap(context.profile, context.shell, evidence);
  const presence = sections.find((p) => p.section === section) ?? { section, present: SETTING_SECTIONS.includes(section), itemCount: null, evidenceIds: [] };
  return { presence, checklist: { profile: context.profile, presence, evidence, shell: context.shell, profileKey: context.profileKey ?? null, answers: context.answers } };
}

// What the section's semantic criteria can rely on: their AI verdicts, or why there are none.
function semanticStateFor(section: OptimizerSection, context: SectionContext, live?: SemanticState): SemanticState {
  if (semanticCriteria(section).length === 0) return { status: "ready", results: [] };
  if (!context.body) return { status: "idle" };
  const partial = partialList(section, context.body);
  if (partial) return { status: "unavailable", reason: `LinkWise read ${partial.read} of your ${partial.total} entries here.` };
  const request = buildChecklistRequest(section, context.body);
  if (!request) return { status: "unavailable", reason: NO_SECTION_TEXT };
  if (live) return live;
  const cached = cachedChecklist(request);
  return cached ? { status: "ready", results: cached } : { status: "idle" };
}

export function sectionChecklist(section: OptimizerSection, context: SectionContext, live?: SemanticState): { presence: SectionPresence; criteria: EvaluatedCriterion[]; summary: ChecklistSummary } {
  const { presence, checklist } = presenceOf(section, context);
  const criteria = presence.present ? evaluateChecklist(section, checklist, semanticStateFor(section, context, live)) : [];
  return { presence, criteria, summary: summarizeChecklist(presence.present, criteria) };
}

function reconcile(assessment: SectionAssessmentDTO, state: ChecklistState | null): SectionAssessmentDTO {
  if (!state) return assessment;
  const next = state === "missing" ? "add" : state;
  if (next === assessment.state) return assessment;
  return { ...assessment, state: next, impact: next === "strong" ? "low" : assessment.state === "strong" ? "medium" : assessment.impact, suggestions: next === "strong" ? [] : assessment.suggestions };
}

// The overall review, with each section's state taken from its checklist so the overview and the
// detail page never disagree. The review keeps its impact and its reasoning.
export function reconcileAssessments(context: SectionContext): SectionAssessmentDTO[] {
  const reconciled = context.overall.map((assessment) => reconcile(assessment, sectionChecklist(assessment.section, context).summary.state));
  const evidence = context.body?.profile.evidence;
  if (!evidence || context.overall.length === 0) return reconciled;
  // A missing optional section is a real recommendation only when the profile's own evidence says it
  // belongs; otherwise it stays low-key, whatever the review said.
  return ["featured", "projects", "certifications"].reduce<SectionAssessmentDTO[]>((list, name) => {
    const section = name as OptimizerSection;
    if (sectionChecklist(section, context).presence.present) return list;
    const relevance = missingRelevance(section, evidence);
    const existing = list.find((a) => a.section === section);
    if (!relevance) return list;
    if (!relevance.relevant) return existing ? list.map((a) => (a === existing ? { ...a, impact: "low" as const } : a)) : list;
    const advice: SectionAssessmentDTO = { section, state: "add", impact: "medium", reason: relevance.reason, sourceType: "linkedin_profile", evidenceIds: relevance.evidenceIds.slice(0, 4), suggestions: [] };
    return existing ? list.map((a) => (a === existing ? { ...existing, state: "add" as const, impact: existing.impact === "low" ? "medium" : existing.impact, reason: existing.state === "add" && existing.reason ? existing.reason : advice.reason, evidenceIds: existing.evidenceIds.length ? existing.evidenceIds : advice.evidenceIds } : a)) : [...list, advice];
  }, reconciled);
}

/** Passed and verifiable checks for each section, so the score can follow every checklist answer. */
export function checklistRatios(context: SectionContext): ChecklistRatios {
  const ratios: ChecklistRatios = {};
  for (const { section } of OPTIMIZER_SECTIONS) {
    const { summary } = sectionChecklist(section, context);
    ratios[section] = { passed: summary.passed, verifiable: summary.verifiable };
  }
  return ratios;
}

// "Strong" only when most of the checklist could actually be verified; otherwise "Partial". Checks
// waiting for the user make it "Needs your review" instead: never Strong, never a failure.
export function sectionDisplay(section: OptimizerSection, context: SectionContext, checked = sectionChecklist(section, context)): { status: DisplayStatus | null; impact: string | null; toReview?: number } {
  const { summary, criteria } = checked;
  const overall = context.overall.find((a) => a.section === section);
  const state = summary.state ?? (summary.checking && overall ? (overall.state === "add" ? "missing" : overall.state) : null);
  if (state === "missing") return { status: "add", impact: overall?.state === "add" ? IMPACT_LABEL[overall.impact] : sectionInfo(section)?.core ? IMPACT_LABEL.high : "Optional" };
  if (state === "improve") {
    const impact = overall ? reconcile(overall, "improve").impact : null;
    return { status: "improve", impact: impact ? IMPACT_LABEL[impact] : null };
  }
  if (summary.needsUser > 0 && !summary.checking) return { status: "review", impact: null, toReview: summary.needsUser };
  const unverifiable = criteria.filter((c) => c.status === "unverifiable").length;
  if (state === "strong") return { status: unverifiable > summary.verifiable ? "partial" : "strong", impact: null };
  if (criteria.length > 0 && !summary.checking && summary.verifiable === 0) return { status: "unverifiable", impact: null };
  return { status: null, impact: null };
}

const ICONS: Partial<Record<OptimizerSection, ReactNode>> = {
  photo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18c1.4-2.2 3.3-3.2 5.5-3.2s4.1 1 5.5 3.2" />
    </>
  ),
  banner: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 15l5-4 4 3 3-2 6 4" />
    </>
  ),
  experience: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M3 12h18" />
    </>
  ),
  education: <path d="M2 9l10-5 10 5-10 5zM6 11v5c1.7 1.3 3.7 2 6 2s4.3-.7 6-2v-5" />,
  projects: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  skills: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />,
  certifications: (
    <>
      <circle cx="12" cy="9" r="5" />
      <path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5" />
    </>
  ),
  languages: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9" />
    </>
  ),
  honors: <path d="M7 4h10v4a5 5 0 0 1-10 0zM12 13v4M8 21h8M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" />,
  volunteering: <path d="M12 20s-8-5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15 12 20 12 20z" />,
  location: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  url: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  openToWork: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  network: (
    <>
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M15 15c2.5 0 4.5 1.3 5.3 4" />
    </>
  ),
};

function SectionIcon({ section, className = "lw-opt-card__icon" }: { section: OptimizerSection; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[section] ?? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h7" />
        </>
      )}
    </svg>
  );
}

const STATUS_MARK: Record<DisplayStatus, string> = { strong: "✓", improve: "!", add: "–", review: "", partial: "–", unverifiable: "–" };
// Spoken and tooltip names for the row's status circle.
export const MARK_LABEL: Record<DisplayStatus, string> = { strong: "Strong", improve: "Needs improvement", add: "Missing section", review: "Needs your review", partial: "Partly verified", unverifiable: "Can't verify" };

export function Chevron() {
  return (
    <svg className="lw-opt-card__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function SectionCards({ context }: { context: SectionContext }) {
  return (
    <nav className="lw-opt-groups" aria-label="Profile Optimizer sections">
      {SECTION_GROUPS.map((group) => (
        <section key={group.title} className="lw-opt-group" aria-label={group.title}>
          <h4 className="lw-opt-group__title">{group.title}</h4>
          <div className="lw-opt-cards">
            {group.sections.map((section) => {
              const title = SECTION_GUIDANCE[section].title;
              const { status, impact, toReview } = sectionDisplay(section, context);
              const label = status ? [MARK_LABEL[status], impact, toReview ? `${toReview} ${toReview === 1 ? "check" : "checks"} left` : null].filter(Boolean).join(" · ") : "Checking";
              return (
                <button key={section} type="button" className="lw-opt-card" aria-label={`${title}. ${label}.`} title={label} onClick={() => openOptimizerPage({ name: "section", section })}>
                  <span className="lw-opt-card__tile" aria-hidden="true">
                    <SectionIcon section={section} />
                  </span>
                  <span className="lw-opt-card__title">{title}</span>
                  {toReview ? (
                    <span className="lw-opt-card__note" aria-hidden="true">
                      {toReview} to review
                    </span>
                  ) : null}
                  {status && (
                    <span className={`lw-opt-status is-${status}`} aria-hidden="true">
                      {status === "review" ? <ReviewIcon /> : STATUS_MARK[status]}
                    </span>
                  )}
                  <Chevron />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

const CRITERION_MARK: Record<EvaluatedCriterion["status"], string> = { pass: "✓", improve: "!", needs_user: "", unverifiable: "○", not_applicable: "—", checking: "" };
const CRITERION_STATE: Record<EvaluatedCriterion["status"], string> = {
  pass: "Meets criterion",
  improve: "Needs improvement",
  needs_user: "Needs your review",
  unverifiable: "Can't verify automatically",
  not_applicable: "Not applicable",
  checking: "Checking",
};

function stateOf(criterion: EvaluatedCriterion): string {
  if (criterion.userValue === true) return "Confirmed by you";
  if (criterion.userValue === false) return "Marked by you as needing improvement";
  return CRITERION_STATE[criterion.status];
}

// A person with a check: "this one is yours to check".
export function ReviewIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.9-3.4 3.4-5 6.5-5 1.4 0 2.6.3 3.6 1M15 18l2.2 2.2L22 15.5" />
    </svg>
  );
}

// Where a row's result comes from, for its tooltip: LinkWise's own check, the AI's reading of the
// text, or the user's answer.
function sourceOf(criterion: EvaluatedCriterion): string {
  if (criterion.userValue === true || criterion.userValue === false) {
    const found = criterion.automatic && criterion.automatic.explanation ? ` LinkWise found: ${criterion.automatic.explanation}` : "";
    return `${criterion.userValue ? "Confirmed" : "Marked as needing improvement"} by you.${found}`;
  }
  if (criterion.status === "needs_user") return "Needs your review";
  return criterion.verification === "semantic" ? "Checked by AI from your profile text" : "Verified by LinkWise";
}

// Every row can be answered: the status control opens a small menu to confirm it, mark it as
// needing improvement, or hand it back to LinkWise's own result (when there is one).
export function ChecklistRows({ criteria, onAnswer }: { criteria: EvaluatedCriterion[]; onAnswer?: (criterionId: string, value: boolean | null) => void }) {
  return (
    <ul className="lw-od-checks">
      {criteria.map((criterion) => {
        const answerable = !!onAnswer && criterion.status !== "checking" && !criterion.id.endsWith("-missing");
        return (
          <li key={criterion.id} className={`lw-od-check is-${criterion.status}${answerable ? " is-own" : ""}`} aria-label={`${criterion.label}: ${stateOf(criterion)}`} title={sourceOf(criterion)}>
            <span className="lw-od-check__mark" aria-hidden="true">
              {criterion.status === "needs_user" ? <ReviewIcon /> : CRITERION_MARK[criterion.status]}
            </span>
            <span className="lw-od-check__text">
              <span className="lw-od-check__label">{criterion.label}</span>
              <span className="lw-od-check__detail">{criterion.explanation}</span>
            </span>
            {answerable && <AnswerMenu criterion={criterion} onAnswer={onAnswer} />}
          </li>
        );
      })}
    </ul>
  );
}

function AnswerMenu({ criterion, onAnswer }: { criterion: EvaluatedCriterion; onAnswer: (criterionId: string, value: boolean | null) => void }) {
  const [open, setOpen] = useState(false);
  const value = criterion.userValue ?? null;
  const { id, label } = criterion;
  // "Use LinkWise result" only exists when LinkWise has one to go back to.
  const hasAutomatic = !!criterion.automatic && criterion.automatic.status !== "needs_user" && criterion.automatic.status !== "unverifiable" && criterion.automatic.status !== "checking";
  const choose = (next: boolean | null) => {
    onAnswer(id, next);
    setOpen(false);
  };
  return (
    <span className="lw-od-answer">
      <button type="button" className={`lw-od-answer__btn${value !== null ? " is-set" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-label={`Change answer for ${label}`} title="Change this answer" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      {open && (
        <span className="lw-od-menu" role="menu" aria-label={`Answer for ${label}`}>
          <button type="button" role="menuitemradio" aria-checked={value === true} aria-label={`Mark ${label} as confirmed`} className="lw-od-menu__item is-yes" onClick={() => choose(true)}>
            <span aria-hidden="true">✓</span> Looks good
          </button>
          <button type="button" role="menuitemradio" aria-checked={value === false} aria-label={`Mark ${label} as needs improvement`} className="lw-od-menu__item is-no" onClick={() => choose(false)}>
            <span aria-hidden="true">!</span> Needs improvement
          </button>
          {value !== null && (
            <button type="button" role="menuitem" aria-label={hasAutomatic ? `Use LinkWise result for ${label}` : `Clear your answer for ${label}`} className="lw-od-menu__item" onClick={() => choose(null)}>
              <span aria-hidden="true">↺</span> {hasAutomatic ? "Use LinkWise result" : "Clear my answer"}
            </button>
          )}
        </span>
      )}
    </span>
  );
}

export function summaryText(summary: ChecklistSummary): string {
  const toReview = summary.needsUser ? `${summary.needsUser} ${summary.needsUser === 1 ? "needs" : "need"} your review` : null;
  if (summary.verifiable === 0) return toReview ?? (summary.checking ? "Checking…" : "Nothing to review");
  return [`${summary.passed} of ${summary.verifiable} verifiable checks passed${summary.checking ? " so far" : ""}`, toReview].filter(Boolean).join(" · ");
}

export function NavSquare({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="lw-nav-button" aria-label={label} title={disabled ? undefined : label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

// One bar at the top of every detail page: overview, previous, the section and where it sits in the
// list, next. Only navigates: the analysis and the user's answers stay as they are. An arrow with
// nowhere to go stays in place, disabled, so the bar never shifts.
function SectionNav({ section }: { section: OptimizerSection }) {
  const { prev, next } = neighborSections(section);
  const position = DETAIL_SECTIONS.indexOf(section) + 1;
  return (
    <nav className="lw-od-nav" aria-label="Profile Optimizer sections">
      <NavSquare label="Profile Optimizer overview" onClick={() => openOptimizerPage({ name: "home" })}>
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
        <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
        <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
      </NavSquare>
      <NavSquare label={prev ? `Previous: ${SECTION_GUIDANCE[prev].title}` : "No previous section"} disabled={!prev} onClick={() => prev && openOptimizerPage({ name: "section", section: prev })}>
        <path d="M19 12H5m6-6-6 6 6 6" />
      </NavSquare>
      <span className="lw-od-nav__center">
        <span className="lw-od-nav__title">
          <SectionIcon section={section} className="lw-od-nav__icon" />
          <span className="lw-od-nav__name">{SECTION_GUIDANCE[section].title}</span>
        </span>
        <span className="lw-od-count">
          {position} / {DETAIL_SECTIONS.length}
        </span>
      </span>
      <NavSquare label={next ? `Next: ${SECTION_GUIDANCE[next].title}` : "No next section"} disabled={!next} onClick={() => next && openOptimizerPage({ name: "section", section: next })}>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </NavSquare>
    </nav>
  );
}

export function SectionPage({ section, context }: { section: OptimizerSection; context: SectionContext }) {
  const guidance = SECTION_GUIDANCE[section];
  const { presence } = useMemo(() => presenceOf(section, context), [section, context]);
  const request = presence.present && context.body ? buildChecklistRequest(section, context.body) : null;
  const { state: live, retry } = useChecklistAssessment(request);
  const checked = sectionChecklist(section, context, request ? live : undefined);
  const { criteria, summary } = checked;
  const display = sectionDisplay(section, context, checked);
  const rows: EvaluatedCriterion[] = presence.present
    ? criteria
    : [{ id: `${section}-missing`, label: `${guidance.title} is not on your profile`, verification: "deterministic", status: "improve", explanation: guidance.missing, evidenceIds: [] }];
  const actions = sectionActions(section, { profileKey: context.profileKey ?? null, present: presence.present, shell: context.shell });

  return (
    <article className="lw-od">
      <SectionNav section={section} />

      <header className="lw-od-head">
        <h3 className="lw-od-title">{guidance.title}</h3>
        <div className="lw-od-status">
          {display.status && <span className={`lw-opt-badge is-${display.status}`}>{STATUS_LABEL[display.status]}</span>}
          <span className="lw-od-status__text">{[display.impact, presence.present ? summaryText(summary) : null].filter(Boolean).join(" · ")}</span>
        </div>
        <p className="lw-od-description">{guidance.description}</p>
        {section === "headline" && context.profile.headline && <blockquote className="lw-opt-quote">{context.profile.headline}</blockquote>}
      </header>

      <section className="lw-od-section" aria-label="Checklist">
        <h4 className="lw-od-heading">Checklist</h4>
        {presence.present && !context.body && semanticCriteria(section).length > 0 && <p className="lw-scan-mode__hint">Reading your profile before the AI checks run…</p>}
        {criteria.some((c) => c.status === "needs_user" || c.userValue !== undefined && c.userValue !== null) && (
          <p className="lw-od-review-note">
            <ReviewIcon />
            {summary.needsUser > 0 ? "Some checks need your review. Your answers update this assessment." : "You've answered every check. Change any answer any time."}
          </p>
        )}
        <ChecklistRows criteria={rows} onAnswer={(id, value) => setManualAnswer(context.profileKey, id, value, context.shell)} />
        {live.status === "unavailable" && request && (
          <button type="button" className="lw-scan__link" onClick={retry}>
            Try the AI checks again
          </button>
        )}
      </section>

      <section className="lw-od-section" aria-label="How to improve">
        <h4 className="lw-od-heading">How to improve</h4>
        <ul className="lw-od-tips">
          {guidance.howToImprove.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {section === "banner" && presence.present && <BannerIdeas context={context} />}

      <MissedSomething section={section} profileKey={context.profileKey ?? null} assessment={context.overall.find((a) => a.section === section)} analyzing={!!context.analyzing} />

      {section === "experience" && display.status === "improve" && context.body && <SectionDrafts section={section} body={context.body} assessment={context.overall.find((a) => a.section === section)} />}

      {section === "about" && (
        <section className="lw-od-section">
          <h4 className="lw-od-heading">AI About writer</h4>
          <p className="lw-od-description">Get About options built only from your profile and what you tell LinkWise.</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={() => openOptimizerPage({ name: "generate", section: "about" })}>
            ✨ Generate using AI
          </button>
        </section>
      )}

      {section === "headline" && (
        <section className="lw-od-section">
          <h4 className="lw-od-heading">AI headline writer</h4>
          <p className="lw-od-description">Get headline options built only from your profile and what you tell LinkWise.</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={() => openOptimizerPage({ name: "generate", section: "headline" })}>
            ✨ Generate using AI
          </button>
        </section>
      )}

      <ActionBar actions={actions} />
    </article>
  );
}

// What to ask under "Missed something?" for each section.
export const NOTE_PLACEHOLDER: Record<OptimizerSection, string> = {
  photo: "Anything about your photo that LinkWise couldn't verify?",
  banner: "Anything about your banner that LinkWise couldn't detect?",
  headline: "Anything important about your headline or target role?",
  about: "Anything important that your About section is meant to communicate?",
  featured: "Add projects, articles, portfolio links, awards, or other work you want to showcase.",
  experience: "Add responsibilities, impact, projects, or results LinkWise may have missed.",
  education: "Add coursework, programs, achievements, or activities LinkWise may have missed.",
  projects: "Add projects that are missing or difficult to find on your profile.",
  skills: "Add important skills LinkWise couldn't find in your Skills section.",
  certifications: "Add certifications or credentials LinkWise may have missed.",
  volunteering: "Add volunteering, service, or community work LinkWise may have missed.",
  honors: "Add awards or recognition LinkWise couldn't find.",
  organizations: "Add clubs, teams, or organizations LinkWise may have missed.",
  languages: "Add languages or proficiency information LinkWise may have missed.",
  location: "Add context about where you want to work, study, or find opportunities.",
  url: "Anything about your profile link or how you share it?",
  openToWork: "Add the roles, locations, or preferences you currently use.",
  network: "Add context about the kinds of people or industries in your network.",
};

// The user's own addition for this section. Nothing is sent while they type: Save keeps the note
// and starts the one analysis update that follows, and the analysis treats it as their word, not
// as something found on LinkedIn.
function MissedSomething({ section, profileKey, assessment, analyzing }: { section: OptimizerSection; profileKey: string | null; assessment: SectionAssessmentDTO | undefined; analyzing: boolean }) {
  const { value: store } = useStoredPreference(sectionNotesPreference);
  const saved = (profileKey && store[profileKey]?.[section]) || "";
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const changed = draft.trim() !== saved.trim();
  const inputId = `lw-note-${section}`;
  // How to make it visible comes from the analysis of what the user said, when it was about this section.
  const visible = saved && assessment?.sourceType === "user_context" && assessment.state !== "strong" ? assessment : null;
  return (
    <section className="lw-od-section lw-od-note" aria-label="Missed something?">
      <h4 className="lw-od-heading">Missed something?</h4>
      <label className="lw-od-note__help" htmlFor={inputId}>
        Add anything LinkWise couldn&apos;t find on your profile.
      </label>
      <textarea id={inputId} className="lw-opt-context__input" rows={2} maxLength={MAX_SECTION_NOTE_CHARS} placeholder={NOTE_PLACEHOLDER[section]} value={draft} onChange={(event) => setDraft(event.target.value)} />
      {(changed || saved) && (
        <div className="lw-od-note__actions">
          {changed && (
            <button type="button" className="lw-button lw-button--secondary" disabled={!profileKey} onClick={() => setSectionNote(profileKey, section, draft)}>
              {draft.trim() ? "Save and update analysis" : "Remove note"}
            </button>
          )}
          {!changed && saved && <span className="lw-od-note__status">{analyzing ? "Updating your assessment…" : "Saved. This is your own note, not something LinkWise found."}</span>}
        </div>
      )}
      {visible && (
        <div className="lw-od-note__visible">
          <h5 className="lw-od-subhead">How to make this visible</h5>
          <p>{visible.reason}</p>
          {visible.suggestions.length > 0 && (
            <ul className="lw-od-tips">
              {visible.suggestions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// Banner ideas drawn from the rest of the profile, loaded with the overview; LinkWise never judges the image itself.
function BannerIdeas({ context }: { context: SectionContext }) {
  const analysis = context.body ? cachedSectionAnalysis(buildSectionRequest("banner", context.body)) : undefined;
  if (!analysis || analysis.ideas.length === 0) return null;
  return (
    <section className="lw-od-section" aria-label="Banner ideas">
      <h4 className="lw-od-heading">Banner ideas from your profile</h4>
      <ul className="lw-od-tips">
        {analysis.ideas.map((idea) => (
          <li key={idea}>{idea}</li>
        ))}
      </ul>
    </section>
  );
}

// Stays at the bottom of the panel; it sits in the page flow, so it never hides the last content.
function ActionBar({ actions }: { actions: ReturnType<typeof sectionActions> }) {
  const [missing, setMissing] = useState(false);
  if (actions.length === 0) return null;
  return (
    <footer className="lw-od-actions">
      {actions.map((action) => (
        <button key={action.label} type="button" className="lw-button" onClick={() => setMissing(!action.run())}>
          {action.label}
        </button>
      ))}
      {missing && <p className="lw-od-actions__note">LinkWise couldn't find that on this page.</p>}
    </footer>
  );
}
