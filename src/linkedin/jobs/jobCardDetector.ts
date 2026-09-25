export interface JobCard {
  element: HTMLElement;
  jobId: string | null;
}

function jobIdFromHref(href: string): string | null {
  const match = /\/jobs\/view\/(\d+)/.exec(href);
  return match ? match[1] : null;
}

export function findJobCards(root: ParentNode = document): JobCard[] {
  const cards = new Map<string, HTMLElement>();
  let anonCount = 0;

  root.querySelectorAll<HTMLElement>("li[data-occludable-job-id]").forEach((el) => {
    const id = el.getAttribute("data-occludable-job-id");
    if (id) cards.set(id, el);
  });

  root.querySelectorAll<HTMLElement>("[data-job-id]").forEach((el) => {
    const id = el.getAttribute("data-job-id");
    if (id && !cards.has(id)) cards.set(id, el);
  });

  root.querySelectorAll<HTMLAnchorElement>('a[href*="/jobs/view/"]').forEach((a) => {
    const id = jobIdFromHref(a.getAttribute("href") ?? "");
    if (id && cards.has(id)) return;
    const card = a.closest("li") ?? a.closest('[role="listitem"]');
    if (!card) return;
    cards.set(id ?? `anon-${anonCount++}`, card as HTMLElement);
  });

  return Array.from(cards.entries()).map(([key, element]) => ({
    jobId: key.startsWith("anon-") ? null : key,
    element,
  }));
}

// LinkedIn renders a card's outer wrapper before its title/content settle, so an empty title
// means the card isn't ready to evaluate yet, not that it truly has no title.
export function isJobCardRendered(card: HTMLElement): boolean {
  const title = card.querySelector('.job-card-list__title--link, a[href*="/jobs/view/"]');
  return !!title?.textContent?.trim();
}
