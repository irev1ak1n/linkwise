import { useMemo, useState, type ReactNode } from "react";
import type { LinkedInProfile } from "../models/profile";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { buildEvidencePayload } from "../ai/evidencePayload";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import { SECTION_GUIDANCE, DETAIL_SECTIONS } from "./sectionGuidance";
import { neighborSections, openOptimizerPage } from "./optimizerNav";
import { buildSectionRequest, useSectionAnalysis } from "./sectionAnalysis";
import { buildChecklistRequest, cachedChecklist, useChecklistAssessment } from "./checklistAssessment";
import {
  CHECKLISTS,
  NO_SECTION_TEXT,
  evaluateChecklist,
  semanticCriteria,
  summarizeChecklist,
  type ChecklistContext,
  type ChecklistState,
  type ChecklistSummary,
  type EvaluatedCriterion,
  type SemanticState,
} from "./checklist";
import { goToTopCardPart, openLinkedInEditor } from "./topCardActions";
import { buildSectionMap, sectionInfo, type OptimizerSection, type SectionPresence } from "./sections";
import type { SectionAssessmentDTO } from "./optimizerTypes";

export const STATUS_LABEL: Record<ChecklistState, string> = { strong: "Looking Good", improve: "Needs Improvement", missing: "Missing" };
const STATUS_MARK: Record<ChecklistState, string> = { strong: "✓", improve: "!", missing: "!" };
const IMPACT_LABEL = { high: "High impact", medium: "Medium impact", low: "Low impact" } as const;
const TOP_CARD: Partial<Record<OptimizerSection, "photo" | "banner" | "headline">> = { photo: "photo", banner: "banner", headline: "headline" };
const PART_NAME: Record<"photo" | "banner" | "headline", string> = { photo: "profile photo", banner: "banner", headline: "headline" };

export interface SectionContext {
  shell: ProfileShell;
  profile: LinkedInProfile;
  // Null until the profile has been fully read, which AI analysis needs.
  body: OptimizeProfileRequestBody | null;
  overall: SectionAssessmentDTO[];
}

function presenceOf(section: OptimizerSection, context: SectionContext): { presence: SectionPresence; checklist: ChecklistContext } {
  const evidence = context.body?.profile.evidence ?? buildEvidencePayload(context.profile);
  const sections = context.body?.sections ?? buildSectionMap(context.profile, context.shell, evidence);
  const presence = sections.find((p) => p.section === section)!;
  return { presence, checklist: { profile: context.profile, presence, evidence } };
}

// What the section's semantic criteria can rely on: their AI verdicts, or why there are none.
function semanticStateFor(section: OptimizerSection, context: SectionContext, live?: SemanticState): SemanticState {
  if (semanticCriteria(section).length === 0) return { status: "ready", results: [] };
  if (!context.body) return { status: "idle" };
  const request = buildChecklistRequest(section, context.body);
  if (!request) return { status: "unavailable", reason: NO_SECTION_TEXT };
  if (live) return live;
  const cached = cachedChecklist(request);
  return cached ? { status: "ready", results: cached } : { status: "idle" };
}

// A section's status from its own checklist. Before the AI half is known, the overall review fills in.
export function sectionStatus(section: OptimizerSection, context: SectionContext): ChecklistState | null {
  const { presence, checklist } = presenceOf(section, context);
  const summary = summarizeChecklist(presence.present, evaluateChecklist(section, checklist, semanticStateFor(section, context)));
  if (summary.state) return summary.state;
  const overall = context.overall.find((a) => a.section === section);
  return overall ? (overall.state === "add" ? "missing" : overall.state) : null;
}

function SectionIcon({ section }: { section: OptimizerSection }) {
  const paths: Partial<Record<OptimizerSection, ReactNode>> = {
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
  };
  return (
    <svg className="lw-opt-card__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {paths[section] ?? (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h7" />
        </>
      )}
    </svg>
  );
}

function StatusMark({ status }: { status: ChecklistState | null }) {
  if (!status) return null;
  return (
    <span className={`lw-opt-status is-${status}`} title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]}>
      {STATUS_MARK[status]}
    </span>
  );
}

export function SectionCards({ context }: { context: SectionContext }) {
  return (
    <nav className="lw-opt-cards" aria-label="Profile Optimizer sections">
      {DETAIL_SECTIONS.map((section) => (
        <button key={section} type="button" className="lw-opt-card" onClick={() => openOptimizerPage({ name: "section", section })}>
          <SectionIcon section={section} />
          <span className="lw-opt-card__title">{SECTION_GUIDANCE[section].title}</span>
          <StatusMark status={sectionStatus(section, context)} />
          {semanticCriteria(section).length > 0 && <span className="lw-opt-ai">✨ AI</span>}
          <span className="lw-opt-card__chevron" aria-hidden="true">
            ›
          </span>
        </button>
      ))}
    </nav>
  );
}

const CRITERION_MARK: Record<EvaluatedCriterion["status"], string> = { pass: "✓", improve: "!", unverifiable: "○", not_applicable: "—", checking: "" };
const CRITERION_STATE: Record<EvaluatedCriterion["status"], string> = {
  pass: "Meets criterion",
  improve: "Needs improvement",
  unverifiable: "Can't verify automatically",
  not_applicable: "Not applicable",
  checking: "Checking",
};

export function ChecklistRows({ criteria }: { criteria: EvaluatedCriterion[] }) {
  return (
    <ul className="lw-opt-checklist">
      {criteria.map((criterion) => (
        <li key={criterion.id} className={`lw-opt-check is-${criterion.status}`} aria-label={`${criterion.label}: ${CRITERION_STATE[criterion.status]}`}>
          <span className="lw-opt-check__mark" aria-hidden="true">
            {CRITERION_MARK[criterion.status]}
          </span>
          <span className="lw-opt-check__text">
            <span className="lw-opt-check__label">
              {criterion.label}
              {criterion.verification === "semantic" && criterion.status !== "unverifiable" && <span className="lw-opt-check__tag">AI</span>}
            </span>
            <span className="lw-opt-check__detail">{criterion.explanation}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function summaryText(summary: ChecklistSummary): string {
  if (summary.verifiable === 0) return summary.checking ? "Checking…" : "Nothing LinkWise can verify automatically";
  return `${summary.passed} of ${summary.verifiable} verifiable criteria met${summary.checking ? " so far" : ""}`;
}

export function SectionPage({ section, context }: { section: OptimizerSection; context: SectionContext }) {
  const guidance = SECTION_GUIDANCE[section];
  const { prev, next } = neighborSections(section);
  const { presence, checklist } = useMemo(() => presenceOf(section, context), [section, context]);
  const request = presence.present && context.body ? buildChecklistRequest(section, context.body) : null;
  const { state: live, retry } = useChecklistAssessment(request);
  const semanticState = semanticStateFor(section, context, request ? live : undefined);
  const criteria = evaluateChecklist(section, checklist, semanticState);
  const summary = summarizeChecklist(presence.present, criteria);
  const part = TOP_CARD[section];

  return (
    <article className="lw-opt-page">
      <button type="button" className="lw-opt-back" onClick={() => openOptimizerPage({ name: "home" })}>
        ← Back to Profile Optimizer
      </button>
      <div className="lw-opt-pager">
        <button type="button" disabled={!prev} onClick={() => prev && openOptimizerPage({ name: "section", section: prev })}>
          ‹ Prev
        </button>
        <span>{guidance.title}</span>
        <button type="button" disabled={!next} onClick={() => next && openOptimizerPage({ name: "section", section: next })}>
          Next ›
        </button>
      </div>

      <h3 className="lw-opt-page__title">{guidance.title}</h3>
      <p className="lw-opt-page__description">{guidance.description}</p>

      {presence.present ? (
        <>
          <section className="lw-opt-block" aria-label="Profile assessment">
            <div className="lw-opt-summary">
              {summary.state && <span className={`lw-opt-badge is-${summary.state}`}>{STATUS_LABEL[summary.state]}</span>}
              <span className="lw-opt-summary__count">{summaryText(summary)}</span>
            </div>
            {section === "headline" && context.profile.headline && <blockquote className="lw-opt-quote">{context.profile.headline}</blockquote>}
            {!context.body && semanticCriteria(section).length > 0 && <p className="lw-scan-mode__hint">Reading your profile before the AI checks run…</p>}
            <ChecklistRows criteria={criteria} />
            {live.status === "unavailable" && request && (
              <button type="button" className="lw-button lw-button--secondary" onClick={retry}>
                Try the AI checks again
              </button>
            )}
          </section>
          {section === "banner" && <BannerIdeas context={context} />}
        </>
      ) : (
        <MissingSection section={section} context={context} />
      )}

      {presence.present && (
        <section className="lw-opt-block">
          <h4>Best practices</h4>
          <ul className="lw-opt-tips">
            {guidance.bestPractices.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {section === "headline" && (
        <section className="lw-opt-block">
          <h4>AI headline writer</h4>
          <p className="lw-scan-mode__hint">Get headline options built only from your profile and what you tell LinkWise.</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={() => openOptimizerPage({ name: "generate", section: "headline" })}>
            ✨ Generate using AI
          </button>
        </section>
      )}

      {part && <TopCardActions part={part} />}
    </article>
  );
}

// An absent section is one recommendation, not a wall of failed criteria.
function MissingSection({ section, context }: { section: OptimizerSection; context: SectionContext }) {
  const guidance = SECTION_GUIDANCE[section];
  const overall = context.overall.find((a) => a.section === section && a.state === "add");
  const impact = overall ? IMPACT_LABEL[overall.impact] : sectionInfo(section).core ? IMPACT_LABEL.high : "Optional";
  const contents = CHECKLISTS[section].filter((c) => c.verification !== "visual").map((c) => c.advice);
  return (
    <>
      <section className="lw-opt-block" aria-label="Profile assessment">
        <div className="lw-opt-summary">
          <span className="lw-opt-badge is-missing">{STATUS_LABEL.missing}</span>
          <span className="lw-opt-summary__count">{impact}</span>
        </div>
        <p>{guidance.missing}</p>
      </section>
      <section className="lw-opt-block">
        <h4>What a strong {guidance.title} section includes</h4>
        <ul className="lw-opt-tips">
          {contents.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

// Banner ideas drawn from the rest of the profile; LinkWise never judges the image itself.
function BannerIdeas({ context }: { context: SectionContext }) {
  const request = context.body ? buildSectionRequest("banner", context.body) : null;
  const { view } = useSectionAnalysis(request);
  if (view.status !== "ready" || view.analysis.ideas.length === 0) return null;
  return (
    <section className="lw-opt-block">
      <h4>Banner ideas from your profile</h4>
      {view.analysis.summary && <p>{view.analysis.summary}</p>}
      <ul className="lw-opt-tips">
        {view.analysis.ideas.map((idea) => (
          <li key={idea}>{idea}</li>
        ))}
      </ul>
    </section>
  );
}

function TopCardActions({ part }: { part: "photo" | "banner" | "headline" }) {
  const [missing, setMissing] = useState(false);
  return (
    <section className="lw-opt-block lw-opt-actions">
      <button type="button" className="lw-button" onClick={() => setMissing(!goToTopCardPart(part))}>
        Go to {PART_NAME[part]}
      </button>
      <button type="button" className="lw-button" onClick={() => setMissing(!openLinkedInEditor(part))}>
        Edit on LinkedIn
      </button>
      {missing && <p className="lw-scan-mode__hint">LinkWise couldn't find that on this page.</p>}
    </section>
  );
}
