// Finds which profile sections have their own "/details/{slug}/" page, from the main profile
// page's own DOM. The link's href is the primary signal, not generated class names or heading
// text: LinkedIn's own URL slug says exactly which section a "Show all" link points to, and
// survives markup/wording changes that would break a heading-text match.
import { detailsPageSection, normalizeProfileUrl } from "./profileAdapter";
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

// Structural discovery only, no OpenAI call here. An unrecognized slug is still queued as
// "unknown" (extensible, never a hard-coded ceiling on which sections can exist), just without
// a known ProfileSectionName to merge its evidence under.
export function discoverProfileSections(doc: Document = document): DiscoveredSection[] {
  const main = doc.querySelector<HTMLElement>('main[role="main"], main') ?? doc.body;
  const links = Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href*="/details/"]'));

  const byUrl = new Map<string, DiscoveredSection>();
  for (const link of links) {
    if (isInsideExcludedLandmark(link)) continue;
    const href = link.getAttribute("href");
    if (!href) continue;
    const normalizedUrl = normalizeProfileUrl(href);
    if (!normalizedUrl || !normalizedUrl.includes("/details/")) continue;
    if (byUrl.has(normalizedUrl)) continue;

    const knownType = detailsPageSection(normalizedUrl);
    const heading = ownSectionHeading(link);
    byUrl.set(normalizedUrl, {
      type: knownType ?? "unknown",
      heading: heading ?? knownType ?? "Unknown section",
      url: href,
      normalizedUrl,
      confidence: knownType ? 1 : 0.5,
    });
  }
  return Array.from(byUrl.values());
}
