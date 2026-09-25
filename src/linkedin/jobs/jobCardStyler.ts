import type { JobCardAction } from "../../models/jobsSettings";

const HIDDEN_CLASS = "lw-job-hidden";
const HIGHLIGHT_CLASS = "lw-job-highlight";
const STYLE_ID = "lw-jobs-style";

export function ensureJobStylesInjected(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${HIDDEN_CLASS} { display: none !important; }
    .${HIGHLIGHT_CLASS} { outline: 2px solid #0a66c2 !important; outline-offset: -2px; background: rgba(10, 102, 194, 0.06); }
  `;
  doc.head.appendChild(style);
}

export function applyCardAction(card: HTMLElement, action: JobCardAction): void {
  card.classList.remove(HIDDEN_CLASS, HIGHLIGHT_CLASS);
  if (action === "hide") card.classList.add(HIDDEN_CLASS);
  else if (action === "highlight") card.classList.add(HIGHLIGHT_CLASS);
}

export function restoreCard(card: HTMLElement): void {
  card.classList.remove(HIDDEN_CLASS, HIGHLIGHT_CLASS);
}
