import type { CSSProperties, ReactNode } from "react";
import { highlightDeclarations } from "../highlightPalette";
import type { HighlightStyle } from "../../signals/highlightCategories";
import { PREVIEW_EDUCATION, PREVIEW_EXPERIENCE, PREVIEW_POST, PREVIEW_SKILLS, previewSegments, skillMarked, type PreviewText } from "./highlightExamples";
import type { HighlightRuleId } from "./settingsNav";

interface PreviewProps {
  id: HighlightRuleId;
  rule: HighlightStyle;
  /** The user's keywords, for the Keywords page. */
  keywords: string[];
}

function Icon({ children, className = "lw-pv__icon" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Marked({ item, id, keywords, mark }: { item: PreviewText; id: HighlightRuleId; keywords: string[]; mark: CSSProperties }) {
  return (
    <>
      {previewSegments(item, id, keywords).map((part, i) =>
        part.marked ? (
          <span key={i} className="lw-pv__mark" style={mark}>
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

// Miniature LinkedIn pieces with the open category's phrases drawn in its current style: the same
// declarations as the ::highlight() rules on the profile, so the preview never drifts from it.
export function HighlightPreviewCards({ id, rule, keywords }: PreviewProps) {
  const mark = highlightDeclarations(rule, id === "keywords") as CSSProperties;
  const text = (item: PreviewText) => <Marked item={item} id={id} keywords={keywords} mark={mark} />;
  return (
    <section className="lw-live" aria-label="Live preview">
      <h4 className="lw-live__heading">Live Preview</h4>

      <article className="lw-pv lw-pv--post" aria-label="Post example">
        <header className="lw-pv__author">
          <span className="lw-pv__avatar" aria-hidden="true">
            <Icon className="lw-pv__avatar-icon">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0" />
            </Icon>
          </span>
          <span className="lw-pv__who">
            <span className="lw-pv__name">
              {PREVIEW_POST.author} <span className="lw-pv__degree">· {PREVIEW_POST.degree}</span>
            </span>
            <span className="lw-pv__headline">{text(PREVIEW_POST.headline)}</span>
            <span className="lw-pv__meta">
              {PREVIEW_POST.time} ·{" "}
              <Icon className="lw-pv__globe">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" />
              </Icon>
            </span>
          </span>
        </header>
        <p className="lw-pv__body">{text(PREVIEW_POST.body)}</p>
        <footer className="lw-pv__social">
          <span className="lw-pv__reactions">
            <span className="lw-pv__reaction lw-pv__reaction--like" aria-hidden="true">
              <Icon className="lw-pv__reaction-icon">
                <path d="M7 11v9H4v-9h3Zm0 0 4-7c1.5 0 2.5 1 2.2 2.6L12.8 10H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" />
              </Icon>
            </span>
            <span className="lw-pv__reaction lw-pv__reaction--celebrate" aria-hidden="true">
              <Icon className="lw-pv__reaction-icon">
                <path d="m4 20 5-12 7 7-12 5Zm9-13 1-3m3 6 3-1m-5-1 3-3" />
              </Icon>
            </span>
            <span className="lw-pv__reaction lw-pv__reaction--love" aria-hidden="true">
              <Icon className="lw-pv__reaction-icon">
                <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
              </Icon>
            </span>
            <span>{text(PREVIEW_POST.reactions)}</span>
          </span>
          <span>{PREVIEW_POST.comments}</span>
        </footer>
      </article>

      <article className="lw-pv" aria-label="Experience example">
        <h5 className="lw-pv__label">
          <Icon>
            <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" />
          </Icon>
          Experience Example
        </h5>
        <div className="lw-pv__entry">
          <span className="lw-pv__logo" aria-hidden="true">
            <Icon className="lw-pv__logo-icon">
              <path d="M5 21V5l7-2 7 2v16M9 9h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2" />
            </Icon>
          </span>
          <div className="lw-pv__entry-text">
            <span className="lw-pv__title">{text(PREVIEW_EXPERIENCE.title)}</span>
            <span className="lw-pv__meta">
              <span>{text(PREVIEW_EXPERIENCE.meta)}</span>
            </span>
            <ul className="lw-pv__bullets">
              {PREVIEW_EXPERIENCE.bullets.map((bullet) => (
                <li key={bullet.text}>{text(bullet)}</li>
              ))}
            </ul>
          </div>
        </div>
      </article>

      <article className="lw-pv" aria-label="Skills example">
        <h5 className="lw-pv__label">
          <Icon>
            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </Icon>
          Skills Example
        </h5>
        <ul className="lw-pv__pills">
          {PREVIEW_SKILLS.map((skill) => {
            const on = skillMarked(skill, id, keywords);
            return (
              <li key={skill.name} className={on ? "lw-pv__pill lw-pv__pill--marked" : "lw-pv__pill"} style={on ? mark : undefined}>
                {skill.name}
              </li>
            );
          })}
        </ul>
      </article>

      <article className="lw-pv" aria-label="Education example">
        <h5 className="lw-pv__label">
          <Icon>
            <path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c0 1.5 3 3 6 3s6-1.5 6-3v-5m4-2v6" />
          </Icon>
          Education Example
        </h5>
        <div className="lw-pv__entry">
          <span className="lw-pv__logo" aria-hidden="true">
            <Icon className="lw-pv__logo-icon">
              <path d="M4 21h16M5 21V10m14 11V10M3 10l9-6 9 6M9 21v-6h6v6" />
            </Icon>
          </span>
          <div className="lw-pv__entry-text">
            <span className="lw-pv__title">{text(PREVIEW_EDUCATION.degree)}</span>
            <span className="lw-pv__meta">
              <span>{text(PREVIEW_EDUCATION.meta)}</span>
            </span>
            <p className="lw-pv__line">{text(PREVIEW_EDUCATION.coursework)}</p>
            {id === "languages" && <p className="lw-pv__line">{text(PREVIEW_EDUCATION.languages)}</p>}
          </div>
        </div>
      </article>
    </section>
  );
}
