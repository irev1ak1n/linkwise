import { useMemo, useState, type ReactNode } from "react";
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
import { SectionDrafts } from "./SectionDrafts";
import { SECTION_GROUPS, buildSectionMap, sectionInfo, type OptimizerSection, type SectionPresence } from "./sections";
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
  if (partial) return { status: "unavailable", reason: `LinkWise read only ${partial.read} of your ${partial.total} entries here, so it can't judge the full list.` };
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
  return context.overall.map((assessment) => reconcile(assessment, sectionChecklist(assessment.section, context).summary.state));
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

export function ChecklistRows({ criteria, onAnswer }: { criteria: EvaluatedCriterion[]; onAnswer?: (criterionId: string, value: boolean | null) => void }) {
  return (
    <ul className="lw-od-checks">
      {criteria.map((criterion) => {
        const own = criterion.verification === "user";
        return (
          <li key={criterion.id} className={`lw-od-check is-${criterion.status}${own ? " is-own" : ""}`} aria-label={`${criterion.label}: ${stateOf(criterion)}`}>
            <span className="lw-od-check__mark" aria-hidden="true">
              {criterion.status === "needs_user" ? <ReviewIcon /> : CRITERION_MARK[criterion.status]}
            </span>
            <span className="lw-od-check__text">
              <span className="lw-od-check__label">{criterion.label}</span>
              <span className="lw-od-check__detail">{criterion.explanation}</span>
            </span>
            {own && onAnswer && <AnswerButtons criterion={criterion} onAnswer={onAnswer} />}
          </li>
        );
      })}
    </ul>
  );
}

// "Looks good" and "Needs work" for a check only the user can make. Pressing the active one again
// clears the answer, so every answer can be changed or withdrawn later.
function AnswerButtons({ criterion, onAnswer }: { criterion: EvaluatedCriterion; onAnswer: (criterionId: string, value: boolean | null) => void }) {
  const value = criterion.userValue ?? null;
  const { id, label } = criterion;
  return (
    <span className="lw-od-answer" role="group" aria-label={`Your check: ${label}`}>
      <button
        type="button"
        className="lw-od-answer__btn is-yes"
        aria-pressed={value === true}
        aria-label={value === true ? `Remove your confirmation of ${label}` : `Mark ${label} as confirmed`}
        title={value === true ? "Confirmed by you. Click to undo." : "Looks good"}
        onClick={() => onAnswer(id, value === true ? null : true)}
      >
        ✓
      </button>
      <button
        type="button"
        className="lw-od-answer__btn is-no"
        aria-pressed={value === false}
        aria-label={value === false ? `Clear needs improvement for ${label}` : `Mark ${label} as needs improvement`}
        title={value === false ? "Marked as needing improvement. Click to undo." : "Needs improvement"}
        onClick={() => onAnswer(id, value === false ? null : false)}
      >
        !
      </button>
    </span>
  );
}

export function summaryText(summary: ChecklistSummary): string {
  const toReview = summary.needsUser ? `${summary.needsUser} ${summary.needsUser === 1 ? "needs" : "need"} your review` : null;
  if (summary.verifiable === 0) return toReview ?? (summary.checking ? "Checking…" : "Nothing LinkWise can verify automatically");
  return [`${summary.passed} of ${summary.verifiable} verifiable checks passed${summary.checking ? " so far" : ""}`, toReview].filter(Boolean).join(" · ");
}

export function SectionPage({ section, context }: { section: OptimizerSection; context: SectionContext }) {
  const guidance = SECTION_GUIDANCE[section];
  const { prev, next } = neighborSections(section);
  const position = DETAIL_SECTIONS.indexOf(section) + 1;
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
      <div className="lw-od-top">
        <button type="button" className="lw-opt-back" onClick={() => openOptimizerPage({ name: "home" })}>
          ← Back to Profile Optimizer
        </button>
        <span className="lw-od-count">
          {position} / {DETAIL_SECTIONS.length}
        </span>
      </div>
      <div className="lw-od-pager">
        <button type="button" disabled={!prev} onClick={() => prev && openOptimizerPage({ name: "section", section: prev })}>
          ‹ Prev
        </button>
        <span className="lw-od-pager__title">
          <SectionIcon section={section} className="lw-od-pager__icon" />
          {guidance.title}
        </span>
        <button type="button" disabled={!next} onClick={() => next && openOptimizerPage({ name: "section", section: next })}>
          Next ›
        </button>
      </div>

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
        {criteria.some((c) => c.verification === "user") && (
          <p className="lw-od-review-note">
            <ReviewIcon />
            {summary.needsUser > 0 ? "Some visual details need your check. Your answers update this assessment." : "You've checked every visual detail. Change an answer any time."}
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

      {(section === "about" || section === "experience") && display.status === "improve" && context.body && <SectionDrafts section={section} body={context.body} assessment={context.overall.find((a) => a.section === section)} />}

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
