const APPLIED_PATTERN = /^applied\b/i;

export function isJobCardApplied(card: HTMLElement): boolean {
  const stateEl = card.querySelector(".job-card-container__footer-job-state");
  if (stateEl && APPLIED_PATTERN.test((stateEl.textContent ?? "").trim())) return true;

  const footerItems = card.querySelectorAll(".job-card-container__footer-item");
  for (const item of Array.from(footerItems)) {
    if (APPLIED_PATTERN.test((item.textContent ?? "").trim())) return true;
  }

  const labeled = card.querySelectorAll<HTMLElement>("[aria-label]");
  for (const el of Array.from(labeled)) {
    if (APPLIED_PATTERN.test((el.getAttribute("aria-label") ?? "").trim())) return true;
  }

  return false;
}
