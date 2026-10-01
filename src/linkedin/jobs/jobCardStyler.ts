import type { JobCardAction } from "../../models/jobsSettings";
import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS, HIGHLIGHT_SHADES, toHighlightColor, type HighlightColor } from "../highlightPalette";

const HIDDEN_CLASS = "lw-job-hidden";
const HIGHLIGHT_CLASS = "lw-job-highlight";
const COLOR_ATTRIBUTE = "data-lw-highlight";
const STYLE_ID = "lw-jobs-style";

const highlightRules = HIGHLIGHT_COLORS.map((color) => {
  const { fill, mark } = HIGHLIGHT_SHADES[color];
  return `.${HIGHLIGHT_CLASS}[${COLOR_ATTRIBUTE}="${color}"] { outline: 2px solid ${mark} !important; outline-offset: -2px; background: color-mix(in srgb, ${fill} 45%, transparent); }`;
}).join("\n    ");

export function ensureJobStylesInjected(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${HIDDEN_CLASS} { display: none !important; }
    ${highlightRules}
  `;
  doc.head.appendChild(style);
}

export function getCardCurrentAction(card: HTMLElement): JobCardAction {
  if (card.classList.contains(HIDDEN_CLASS)) return "hide";
  if (card.classList.contains(HIGHLIGHT_CLASS)) return "highlight";
  return "none";
}

export function getCardHighlightColor(card: HTMLElement): HighlightColor | null {
  return toHighlightColor(card.getAttribute(COLOR_ATTRIBUTE)) ?? null;
}

export function applyCardAction(card: HTMLElement, action: JobCardAction, color: HighlightColor = DEFAULT_HIGHLIGHT_COLOR): void {
  card.classList.remove(HIDDEN_CLASS, HIGHLIGHT_CLASS);
  card.removeAttribute(COLOR_ATTRIBUTE);
  if (action === "hide") card.classList.add(HIDDEN_CLASS);
  else if (action === "highlight") {
    card.classList.add(HIGHLIGHT_CLASS);
    card.setAttribute(COLOR_ATTRIBUTE, color);
  }
}

export function restoreCard(card: HTMLElement): void {
  card.classList.remove(HIDDEN_CLASS, HIGHLIGHT_CLASS);
  card.removeAttribute(COLOR_ATTRIBUTE);
}
