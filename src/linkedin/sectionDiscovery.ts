// Finds which profile sections have their own "/details/{slug}/" page, from the main profile
// page's own DOM. The link's href is the primary signal, not generated class names or heading
// text: LinkedIn's own URL slug says exactly which section a "Show all" link points to, and
// survives markup/wording changes that would break a heading-text match.
import { detailsPageSection, detailsPageSlug, isProfileManagementUrl, normalizeProfileUrl } from "./profileAdapter";
import type { ProfileSectionName } from "../models/profile";

export interface DiscoveredSection {
  type: ProfileSectionName | "unknown";
  heading: string;
  url: string;
  normalizedUrl: string;
  confidence: number;
}

// The same landmarks expandContent.ts excludes: never real profile content, on either page.
function isInsideExcludedLandmark(el: Element): boolean {
  return el.closest("aside") !== null || el.closest("header") !== null || el.closest("nav") !== null;
}

// A link's own enclosing <section> heading, walking outward past any nested per-entry section
// (e.g. a Projects entry wrapping itself with the project's own name) to find the real one.
function ownSectionHeading(link: Element): string | null {
  let section: Element | null = link.closest("section");
  while (section) {
    const heading = Array.from(section.querySelectorAll("h2, h3")).find((h) => h.closest("section") === section);
    if (heading?.textContent?.trim()) return heading.textContent.trim();
    section = section.parentElement?.closest("section") ?? null;
  }
  return null;
}

interface Candidate {
  href: string;
  heading: string | null;
}

// Structural discovery only, no OpenAI call here. An unrecognized slug is still queued as
// "unknown" (extensible, never a hard-coded ceiling on which sections can exist), just without
// a known ProfileSectionName to merge its evidence under.
export function discoverProfileSections(doc: Document = document): DiscoveredSection[] {
  const main = doc.querySelector<HTMLElement>('main[role="main"], main') ?? doc.body;
  const links = Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href*="/details/"]'));

  // Every non-management candidate href for a section, grouped by its normalized URL — the
  // same section can appear as several distinct hrefs (a "Show all" link, a per-entry link, a
  // tracking-param variant), and the canonical one is chosen only after seeing them all.
  const candidatesByUrl = new Map<string, Candidate[]>();
  for (const link of links) {
    if (isInsideExcludedLandmark(link)) continue;
    const href = link.getAttribute("href");
    if (!href) continue;
    if (isProfileManagementUrl(href)) continue; // never open an "edit this entry" or add/create route
    const normalizedUrl = normalizeProfileUrl(href);
    if (!normalizedUrl || !normalizedUrl.includes("/details/")) continue;

    const candidates = candidatesByUrl.get(normalizedUrl) ?? [];
    candidates.push({ href, heading: ownSectionHeading(link) });
    candidatesByUrl.set(normalizedUrl, candidates);
  }

  const sections: DiscoveredSection[] = [];
  for (const [normalizedUrl, candidates] of candidatesByUrl) {
    // Shortest read-only href wins: a bare "/details/{slug}/" route is always shorter than one
    // carrying tracking params or an extra path segment.
    const chosen = candidates.reduce((shortest, c) => (c.href.length < shortest.href.length ? c : shortest));
    const knownType = detailsPageSection(normalizedUrl);
    const heading = candidates.map((c) => c.heading).find((h) => h) ?? null;
    sections.push({
      type: knownType ?? "unknown",
      heading: heading ?? knownType ?? "Unknown section",
      url: chosen.href,
      normalizedUrl,
      confidence: knownType ? 1 : 0.5,
    });
  }
  return sections;
}

// Discoverable, but deliberately left out of the auto-scan crawl queue for now. Skills is
// already covered by the main profile page's own evidence (see profileAdapter.ts), and Interests
// is low-value for matching and only lengthens the scan.
const EXCLUDED_FROM_CRAWL_QUEUE = new Set(["skills", "interests"]);

// A section left out here is simply absent from the queue, never a queued-then-failed entry.
export function excludeFromAutoScanQueue(sections: DiscoveredSection[]): DiscoveredSection[] {
  return sections.filter((section) => {
    const slug = detailsPageSlug(section.normalizedUrl);
    return !slug || !EXCLUDED_FROM_CRAWL_QUEUE.has(slug);
  });
}
