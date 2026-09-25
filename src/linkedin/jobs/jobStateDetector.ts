function hasJobState(card: HTMLElement, word: string): boolean {
  const pattern = new RegExp(`^${word}\\b`, "i");
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

  // New layout: the state is a bare <p>, so it's matched strictly to skip titles and companies.
  const bareState = new RegExp(`^${word}(\\s+(\\d|on\\b).*)?$`, "i");
  for (const p of Array.from(card.querySelectorAll("p"))) {
    if (bareState.test((p.textContent ?? "").trim())) return true;
  }

  return false;
}

export function isJobCardApplied(card: HTMLElement): boolean {
  return hasJobState(card, "applied");
}

export function isJobCardViewed(card: HTMLElement): boolean {
  return hasJobState(card, "viewed");
}

export function isJobCardSaved(card: HTMLElement): boolean {
  return hasJobState(card, "saved");
}
