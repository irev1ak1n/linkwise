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
  const parts = Array.from(card.querySelectorAll<HTMLElement>(TEXT_SELECTORS)).map((el) => el.textContent ?? "");
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
