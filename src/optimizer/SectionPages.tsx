import { useState, type ReactNode } from "react";
import type { LinkedInProfile } from "../models/profile";
import type { ProfileShell } from "../linkedin/profileAdapter";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import { SECTION_GUIDANCE, DETAIL_SECTIONS } from "./sectionGuidance";
import { neighborSections, openOptimizerPage } from "./optimizerNav";
import { buildSectionRequest, cachedSectionAnalysis, useSectionAnalysis, type SectionAnalysisView } from "./sectionAnalysis";
import { goToTopCardPart, openLinkedInEditor } from "./topCardActions";
import type { OptimizerSection } from "./sections";
import type { HeadlineAspect, SectionAnalysisDTO, SectionAnalysisState, SectionAssessmentDTO } from "./optimizerTypes";

export const STATUS_LABEL: Record<SectionAnalysisState, string> = { strong: "Looking Good", improve: "Needs Improvement", missing: "Missing" };
const STATUS_MARK: Record<SectionAnalysisState, string> = { strong: "✓", improve: "!", missing: "!" };
const ASPECT_LABEL: Record<HeadlineAspect, string> = {
  role: "Role or direction",
  skills: "Skills",
  keywords: "Searchable keywords",
  specificity: "Specificity",
  focus: "Focus",
  differentiation: "What sets you apart",
  readability: "Readability",
  accuracy: "Accuracy",
};
const PART_NAME: Partial<Record<OptimizerSection, string>> = { photo: "profile photo", banner: "banner", headline: "headline" };

export interface SectionContext {
  shell: ProfileShell;
  profile: LinkedInProfile;
  // Null until the profile has been fully read, which AI analysis needs.
  body: OptimizeProfileRequestBody | null;
  overall: SectionAssessmentDTO[];
}

// Photo and banner status come straight from the page; the headline's from its own analysis when
// it has run, else from the overall review.
export function sectionStatus(section: OptimizerSection, context: SectionContext, analysis?: SectionAnalysisDTO): SectionAnalysisState | null {
  if (section === "photo") return context.shell.hasPhoto ? "strong" : "missing";
  if (section === "banner") return context.shell.hasBanner ? "strong" : "improve";
  if (section === "headline" && !context.profile.headline) return "missing";
  if (analysis) return analysis.state;
  const overall = context.overall.find((a) => a.section === section);
  return overall ? (overall.state === "add" ? "missing" : overall.state) : null;
}

function cachedAnalysis(section: OptimizerSection, body: OptimizeProfileRequestBody | null): SectionAnalysisDTO | undefined {
  return body && (section === "headline" || section === "banner") ? cachedSectionAnalysis(buildSectionRequest(section, body)) : undefined;
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
    headline: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9h10M7 13h7" />
      </>
    ),
  };
  return (
    <svg className="lw-opt-card__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {paths[section]}
    </svg>
  );
}

function StatusMark({ status }: { status: SectionAnalysisState | null }) {
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
      {DETAIL_SECTIONS.map((section) => {
        const guidance = SECTION_GUIDANCE[section]!;
        const status = sectionStatus(section, context, cachedAnalysis(section, context.body));
        return (
          <button key={section} type="button" className="lw-opt-card" onClick={() => openOptimizerPage({ name: "section", section })}>
            <SectionIcon section={section} />
            <span className="lw-opt-card__title">{guidance.title}</span>
            <StatusMark status={status} />
            {guidance.aiCapable && <span className="lw-opt-ai">✨ AI</span>}
            <span className="lw-opt-card__chevron" aria-hidden="true">
              ›
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function SectionPage({ section, context }: { section: OptimizerSection; context: SectionContext }) {
  const guidance = SECTION_GUIDANCE[section]!;
  const { prev, next } = neighborSections(section);
  const analyzed = section === "headline" || section === "banner";
  const request = analyzed && context.body && (section !== "headline" || context.profile.headline) ? buildSectionRequest(section, context.body) : null;
  const { view, retry } = useSectionAnalysis(request);
  const status = sectionStatus(section, context, view.status === "ready" ? view.analysis : undefined);

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

      <section className="lw-opt-block">
        <h4>Profile assessment</h4>
        {status && <span className={`lw-opt-badge is-${status}`}>{STATUS_LABEL[status]}</span>}
        <Assessment section={section} context={context} view={view} onRetry={retry} />
      </section>

      <section className="lw-opt-block">
        <h4>Checklist</h4>
        <ul className="lw-opt-checklist">
          {guidance.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="lw-opt-block">
        <h4>Best practices</h4>
        <ul className="lw-opt-tips">
          {guidance.bestPractices.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      {section === "headline" && (
        <section className="lw-opt-block">
          <h4>AI headline writer</h4>
          <p className="lw-scan-mode__hint">Get headline options built only from your profile and what you tell LinkWise.</p>
          <button type="button" className="lw-button lw-button--secondary" onClick={() => openOptimizerPage({ name: "generate", section: "headline" })}>
            ✨ Generate using AI
          </button>
        </section>
      )}

      <TopCardActions section={section} />
    </article>
  );
}

function Assessment({ section, context, view, onRetry }: { section: OptimizerSection; context: SectionContext; view: SectionAnalysisView; onRetry: () => void }) {
  if (section === "photo") {
    return (
      <p>
        {context.shell.hasPhoto
          ? "LinkWise found a profile photo. It doesn't analyze the image itself, so use the checklist below to review it."
          : "LinkWise didn't find a profile photo on your profile. Adding one is one of the quickest ways to make your profile more recognizable."}
      </p>
    );
  }
  const intro =
    section === "banner" ? (
      <p>
        {context.shell.hasBanner
          ? "LinkWise found a custom banner. It doesn't analyze the image itself, so use the checklist below to review it."
          : "LinkWise didn't find a custom banner, so your profile appears to use LinkedIn's default background."}
      </p>
    ) : context.profile.headline ? (
      <blockquote className="lw-opt-quote">{context.profile.headline}</blockquote>
    ) : (
      <p>You don't have a headline yet. Without one, people see little about you beyond your name.</p>
    );
  return (
    <>
      {intro}
      <AiAnalysis section={section} view={view} onRetry={onRetry} waiting={!context.body} />
    </>
  );
}

function AiAnalysis({ section, view, onRetry, waiting }: { section: OptimizerSection; view: SectionAnalysisView; onRetry: () => void; waiting: boolean }) {
  if (waiting) return <p className="lw-scan-mode__hint">Reading your profile…</p>;
  if (view.status === "idle") return null;
  if (view.status === "loading") return <p className="lw-scan-mode__hint">{section === "headline" ? "Reviewing your headline…" : "Finding banner ideas from your profile…"}</p>;
  if (view.status === "unavailable") {
    return (
      <div className="lw-opt-ai-block">
        <p className="lw-scan-mode__hint">AI analysis is unavailable right now ({view.reason}).</p>
        <button type="button" className="lw-button lw-button--secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  const { summary, findings, ideas } = view.analysis;
  return (
    <div className="lw-opt-ai-block">
      <span className="lw-opt-ai">✨ AI analysis of your profile</span>
      {summary && <p>{summary}</p>}
      {findings.length > 0 && (
        <ul className="lw-opt-findings">
          {findings.map((finding) => (
            <li key={finding.aspect} className={`is-${finding.verdict}`}>
              <span className="lw-opt-findings__mark">{finding.verdict === "good" ? "✓" : "!"}</span>
              <span>
                <strong>{ASPECT_LABEL[finding.aspect]}:</strong> {finding.note}
              </span>
            </li>
          ))}
        </ul>
      )}
      {ideas.length > 0 && (
        <>
          <p className="lw-opt-subhead">Ideas based on your profile</p>
          <ul className="lw-opt-tips">
            {ideas.map((idea) => (
              <li key={idea}>{idea}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TopCardActions({ section }: { section: OptimizerSection }) {
  const [missing, setMissing] = useState(false);
  const part = section as "photo" | "banner" | "headline";
  return (
    <section className="lw-opt-block lw-opt-actions">
      <button type="button" className="lw-button" onClick={() => setMissing(!goToTopCardPart(part))}>
        Go to {PART_NAME[section]}
      </button>
      <button type="button" className="lw-button" onClick={() => setMissing(!openLinkedInEditor(part))}>
        Edit on LinkedIn
      </button>
      {missing && <p className="lw-scan-mode__hint">LinkWise couldn't find that on this page.</p>}
    </section>
  );
}
