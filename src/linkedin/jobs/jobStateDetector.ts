function hasJobState(card: HTMLElement, pattern: RegExp): boolean {
  const stateEl = card.querySelector(".job-card-container__footer-job-state");
  if (stateEl && pattern.test((stateEl.textContent ?? "").trim())) return true;

  const footerItems = card.querySelectorAll(".job-card-container__footer-item");
  for (const item of Array.from(footerItems)) {
    if (pattern.test((item.textContent ?? "").trim())) return true;
  }

  const labeled = card.querySelectorAll<HTMLElement>("[aria-label]");
  for (const el of Array.from(labeled)) {
    if (pattern.test((el.getAttribute("aria-label") ?? "").trim())) return true;
  }

  return false;
}

export function isJobCardApplied(card: HTMLElement): boolean {
  return hasJobState(card, /^applied\b/i);
}

export function isJobCardViewed(card: HTMLElement): boolean {
  return hasJobState(card, /^viewed\b/i);
}
