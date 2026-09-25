const TEXT_SELECTORS = [
  ".job-card-list__title--link",
  'a[href*="/jobs/view/"]',
  ".artdeco-entity-lockup__subtitle",
  ".job-card-container__metadata-wrapper",
  ".artdeco-entity-lockup__caption",
  ".artdeco-entity-lockup__metadata",
  ".job-card-container__footer-item",
].join(", ");

export function parseKeywords(keywordsText: string): string[] {
  return keywordsText
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function extractCardText(card: HTMLElement): string {
  let els = Array.from(card.querySelectorAll<HTMLElement>(TEXT_SELECTORS));
  // New layout: title, company and location are the first three <p>s.
  if (els.length === 0) els = Array.from(card.querySelectorAll<HTMLElement>("p")).slice(0, 3);
  const parts = els.map((el) => el.textContent ?? "");
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function matchedKeyword(cardText: string, keywords: string[], caseInsensitive: boolean): string | null {
  const haystack = caseInsensitive ? cardText.toLowerCase() : cardText;
  for (const keyword of keywords) {
    const needle = caseInsensitive ? keyword.toLowerCase() : keyword;
    if (needle && haystack.includes(needle)) return keyword;
  }
  return null;
}
