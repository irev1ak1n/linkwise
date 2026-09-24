// The one file that queries LinkedIn's DOM. Every other module works with the LinkedInProfile
// type this produces, never a LinkedIn selector directly, so only one file needs to change
// when LinkedIn's markup changes.
//
// Reads only what's already rendered. Never fetches another page or expands a section itself.
import {
  EMPTY_PROFILE,
  type LinkedInProfile,
  type ProfileEducationEntry,
  type ProfileExperienceEntry,
  type ProfileListEntry,
  type ProfileSectionName,
} from "../models/profile";

// How each section's heading is recognized. A few sections have multiple real-world heading
// variants, so those match by substring. Shared by extraction and detection so they can't drift.
const SECTION_MATCHERS: { name: ProfileSectionName; matches: (headingText: string) => boolean }[] = [
  { name: "about", matches: (t) => t === "about" },
  { name: "experience", matches: (t) => t === "experience" },
  { name: "education", matches: (t) => t === "education" },
  { name: "skills", matches: (t) => t === "skills" },
  { name: "projects", matches: (t) => t === "projects" },
  { name: "certifications", matches: (t) => t.includes("certification") || t.includes("license") },
  { name: "organizations", matches: (t) => t.includes("organization") },
  { name: "volunteering", matches: (t) => t.includes("volunteer") },
  { name: "languages", matches: (t) => t.includes("language") },
  { name: "honors", matches: (t) => t.includes("honor") || t.includes("award") },
];

function matcherFor(name: ProfileSectionName): (headingText: string) => boolean {
  return SECTION_MATCHERS.find((m) => m.name === name)!.matches;
}

function cleanText(text: string | null | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

// LinkedIn duplicates text with a screen-reader copy next to an aria-hidden one, so reading
// textContent naively doubles it. Prefer the aria-hidden copy when one exists.
function visibleText(element: Element): string | undefined {
  const ariaHidden = element.querySelector('[aria-hidden="true"]');
  if (ariaHidden) return cleanText(ariaHidden.textContent);
  return cleanText(element.textContent);
}

function findMain(doc: Document): HTMLElement {
  return doc.querySelector<HTMLElement>('main[role="main"], main') ?? doc.body;
}

// Headings are queried once by the caller, since five separate subtree traversals per tick
// hurt page responsiveness.
function findHeadingSection(headings: HTMLElement[], name: ProfileSectionName): HTMLElement | null {
  const matches = matcherFor(name);
  const match = headings.find((el) => matches((el.textContent ?? "").trim().toLowerCase()));
  if (!match) return null;
  // Walk up to the nearest <section>, or a bounded ancestor walk if there isn't one.
  const section = match.closest("section");
  if (section) return section;
  let node: HTMLElement | null = match.parentElement;
  let depth = 0;
  while (node && depth < 6) {
    if (node.parentElement && node.parentElement.children.length <= 3) return node;
    node = node.parentElement;
    depth++;
  }
  return match.parentElement;
}

// The name heading. LinkedIn doesn't always render an h1 here, often it's the first h2.
function findIdentityHeading(main: HTMLElement): HTMLElement | null {
  return main.querySelector<HTMLElement>("h1") ?? main.querySelector<HTMLElement>("h2");
}

function extractName(main: HTMLElement): string | undefined {
  const heading = findIdentityHeading(main);
  return heading ? visibleText(heading) : undefined;
}

const MAX_IDENTITY_CARD_WALK = 12;
// Past this much text, an ancestor has almost certainly widened out to the rest of the page.
const MAX_IDENTITY_CARD_TEXT_LENGTH = 3000;

// The name heading's ancestor that also has the headline/location. .closest("section") isn't
// reliable here, so this walks up until the text grows meaningfully past just the name.
function findIdentityCardContainer(heading: HTMLElement): HTMLElement | null {
  const nameLength = (heading.textContent ?? "").trim().length;
  let node: HTMLElement | null = heading.parentElement;
  let depth = 0;
  while (node && depth < MAX_IDENTITY_CARD_WALK) {
    const textLength = (node.textContent ?? "").trim().length;
    if (textLength > nameLength + 15 && textLength < MAX_IDENTITY_CARD_TEXT_LENGTH) return node;
    node = node.parentElement;
    depth++;
  }
  return heading.parentElement;
}

// A bare connection-degree badge, LinkedIn UI chrome, never a real headline. The identity card
// can include mutual-connection badges that would otherwise match the headline filter.
function isConnectionDegreeBadge(text: string): boolean {
  return /^[·•]?\s*(1st|2nd|3rd)\+?$/i.test(text.trim());
}

// Pronoun words for a "She/Her"-style badge, which sits above the real headline and would
// otherwise get picked up as one. A real headline with a slash has multi-word parts, so this
// can't accidentally match a real one.
const PRONOUN_WORDS = new Set([
  "he",
  "him",
  "his",
  "she",
  "her",
  "hers",
  "they",
  "them",
  "theirs",
  "ze",
  "zir",
  "hir",
  "xe",
  "xem",
  "per",
  "pers",
]);

function isPronounBadge(text: string): boolean {
  const trimmed = text.trim();
  if (!/^[a-z]+(\/[a-z]+){1,3}$/i.test(trimmed)) return false;
  return trimmed
    .toLowerCase()
    .split("/")
    .every((part) => PRONOUN_WORDS.has(part));
}

// The headline is a short plain-text block just below the name, no interactive children.
function extractHeadline(main: HTMLElement): string | undefined {
  const heading = findIdentityHeading(main);
  if (!heading) return undefined;
  const container = findIdentityCardContainer(heading);
  if (!container) return undefined;

  const name = extractName(main);
  // LinkedIn doesn't consistently use one tag here, check div/span/p rather than assume.
  const candidates = Array.from(container.querySelectorAll<HTMLElement>("div, span, p"));
  for (const el of candidates) {
    if (el.querySelector("h1, h2, button, a, ul, li")) continue;
    const text = visibleText(el);
    if (
      text &&
      text.length >= 3 &&
      text.length <= 220 &&
      text !== name &&
      !isConnectionDegreeBadge(text) &&
      !isPronounBadge(text)
    ) {
      return text;
    }
  }
  return undefined;
}

function extractLocation(main: HTMLElement, headline: string | undefined): string | undefined {
  const heading = findIdentityHeading(main);
  if (!heading) return undefined;
  const container = findIdentityCardContainer(heading);
  if (!container) return undefined;

  const candidates = Array.from(container.querySelectorAll<HTMLElement>("span, p"));
  for (const el of candidates) {
    const text = visibleText(el);
    if (!text || text === headline || text.length > 100) continue;
    // A location line is short and usually has a comma or "area", rather than a hardcoded
    // list of place names.
    if (/,/.test(text) || /\barea\b/i.test(text)) return text;
  }
  return undefined;
}

function extractAbout(headings: HTMLElement[]): string | undefined {
  const section = findHeadingSection(headings, "about");
  return section ? sectionBodyText(section, "about") : undefined;
}

// Strips a section's own heading text from its full text content.
function sectionBodyText(section: HTMLElement, name: ProfileSectionName): string | undefined {
  const matches = matcherFor(name);
  const heading = Array.from(section.querySelectorAll<HTMLElement>("h2, h3")).find((h) =>
    matches((h.textContent ?? "").trim().toLowerCase()),
  );
  const headingText = (heading?.textContent ?? "").trim();
  let text = (section.textContent ?? "").trim();
  if (headingText && text.startsWith(headingText)) {
    text = text.slice(headingText.length);
  }
  return cleanText(text.replace(/…\s*(see more|more)/gi, ""));
}

// LinkedIn often doesn't render Experience as li/ul, just unlabeled nested divs with no
// reliable boundary between roles. Falls back to one blob entry rather than guessing splits.
function extractExperience(headings: HTMLElement[]): ProfileExperienceEntry[] {
  const section = findHeadingSection(headings, "experience");
  if (!section) return [];

  const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
  if (items.length > 0) {
    const entries: ProfileExperienceEntry[] = [];
    for (const item of items) {
      const textLines = Array.from(item.querySelectorAll<HTMLElement>("span[aria-hidden='true'], div, span"))
        .map((el) => visibleText(el))
        .filter((text): text is string => Boolean(text));
      const unique = [...new Set(textLines)];
      if (unique.length === 0) continue;

      const [title, company, ...rest] = unique;
      const description = rest.find((line) => line.length > 40);
      const entry: ProfileExperienceEntry = {
        title: cleanText(title),
        company: cleanText(company),
        description: cleanText(description),
      };
      if (entry.title || entry.company || entry.description) entries.push(entry);
    }
    if (entries.length > 0) return entries;
  }

  const body = sectionBodyText(section, "experience");
  return body ? [{ description: body }] : [];
}

function extractEducation(headings: HTMLElement[]): ProfileEducationEntry[] {
  const section = findHeadingSection(headings, "education");
  if (!section) return [];

  const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
  if (items.length > 0) {
    const entries: ProfileEducationEntry[] = [];
    for (const item of items) {
      const textLines = Array.from(item.querySelectorAll<HTMLElement>("span[aria-hidden='true'], div, span"))
        .map((el) => visibleText(el))
        .filter((text): text is string => Boolean(text));
      const unique = [...new Set(textLines)];
      if (unique.length === 0) continue;

      const [school, degreeAndField] = unique;
      const entry: ProfileEducationEntry = {
        school: cleanText(school),
        degree: cleanText(degreeAndField),
      };
      if (entry.school || entry.degree) entries.push(entry);
    }
    if (entries.length > 0) return entries;
  }

  const body = sectionBodyText(section, "education");
  return body ? [{ school: body }] : [];
}

// Same "try li first, fall back to blob text" shape as Experience/Education, shared by every
// simple name-plus-description section.
function extractListEntries(headings: HTMLElement[], name: ProfileSectionName): ProfileListEntry[] {
  const section = findHeadingSection(headings, name);
  if (!section) return [];

  const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
  if (items.length > 0) {
    const entries: ProfileListEntry[] = [];
    for (const item of items) {
      const textLines = Array.from(item.querySelectorAll<HTMLElement>("span[aria-hidden='true'], div, span"))
        .map((el) => visibleText(el))
        .filter((text): text is string => Boolean(text));
      const unique = [...new Set(textLines)];
      if (unique.length === 0) continue;

      const [entryName, ...rest] = unique;
      const description = rest.find((line) => line.length > 20);
      const entry: ProfileListEntry = { name: cleanText(entryName), description: cleanText(description) };
      if (entry.name || entry.description) entries.push(entry);
    }
    if (entries.length > 0) return entries;
  }

  const body = sectionBodyText(section, name);
  return body ? [{ description: body }] : [];
}

// A compact "Top skills" widget, a p label not a heading, often appears even without a full
// Skills section. Checked first, merged with a full section when one exists.
function extractTopSkillsWidget(main: HTMLElement): string[] {
  const label = Array.from(main.querySelectorAll<HTMLElement>("p")).find(
    (p) => (p.textContent ?? "").trim().toLowerCase() === "top skills",
  );
  if (!label) return [];
  const container = label.parentElement?.parentElement ?? label.parentElement;
  if (!container) return [];

  const text = (container.textContent ?? "").trim();
  const withoutLabel = text.startsWith("Top skills") ? text.slice("Top skills".length) : text;
  const skills: string[] = [];
  for (const part of withoutLabel.split("•")) {
    const cleaned = cleanText(part);
    if (cleaned && cleaned.length < 60) skills.push(cleaned);
  }
  return skills;
}

function extractSkills(main: HTMLElement, headings: HTMLElement[]): string[] {
  const skills: string[] = [...extractTopSkillsWidget(main)];

  const section = findHeadingSection(headings, "skills");
  if (section) {
    const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
    if (items.length > 0) {
      for (const item of items) {
        const text = visibleText(item.querySelector<HTMLElement>("span[aria-hidden='true']") ?? item);
        if (text && text.length < 60) skills.push(text);
      }
    } else {
      const body = sectionBodyText(section, "skills");
      if (body) {
        for (const part of body.split(/[•,]/)) {
          const cleaned = cleanText(part);
          if (cleaned && cleaned.length < 60) skills.push(cleaned);
        }
      }
    }
  }

  return [...new Set(skills)];
}

// Reads the currently-rendered profile page. Never throws, an unfinished page just yields
// undefined fields with extracted: false.
export function extractLinkedInProfile(doc: Document = document): LinkedInProfile {
  const main = findMain(doc);
  const name = extractName(main);
  const headline = extractHeadline(main);
  const location = extractLocation(main, headline);

  // Queried once and reused below, see findHeadingSection for why that matters.
  const headings = Array.from(main.querySelectorAll<HTMLElement>("h2, h3"));
  const about = extractAbout(headings);
  const experience = extractExperience(headings);
  const education = extractEducation(headings);
  const skills = extractSkills(main, headings);
  const projects = extractListEntries(headings, "projects");
  const certifications = extractListEntries(headings, "certifications");
  const organizations = extractListEntries(headings, "organizations");
  const volunteering = extractListEntries(headings, "volunteering");
  const languages = extractListEntries(headings, "languages");
  const honors = extractListEntries(headings, "honors");

  const extracted = Boolean(name || headline);
  if (!extracted) return { ...EMPTY_PROFILE };

  return {
    name,
    headline,
    location,
    about,
    experience,
    education,
    skills,
    projects,
    certifications,
    organizations,
    volunteering,
    languages,
    honors,
    extracted,
  };
}

// Which sections have a heading visible, whether or not their content is captured yet.
// Used only for the collection-progress display, never to change what gets extracted.
export function detectProfileSections(doc: Document = document): ProfileSectionName[] {
  const main = findMain(doc);
  const headings = Array.from(main.querySelectorAll<HTMLElement>("h2, h3"));
  const detected: ProfileSectionName[] = [];
  for (const { name, matches } of SECTION_MATCHERS) {
    if (headings.some((el) => matches((el.textContent ?? "").trim().toLowerCase()))) detected.push(name);
  }
  if (!detected.includes("skills") && extractTopSkillsWidget(main).length > 0) detected.push("skills");
  return detected;
}

// A stable profile identity, the vanity-slug path segment, never the full URL with its
// volatile tracking params. Null when the URL isn't a profile page. Matches a "/details/..."
// page the same as the main profile, since both share the same "/in/{slug}" prefix.
export function profileIdentityKey(url: string): string | null {
  const match = /\/in\/([^/?#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

// LinkedIn's own URL slugs for a section's "Show all" detail page, stable and independent of
// whatever heading text that page happens to render.
const DETAILS_PAGE_SLUGS: Record<string, ProfileSectionName> = {
  experience: "experience",
  education: "education",
  skills: "skills",
  languages: "languages",
  honors: "honors",
  certifications: "certifications",
  projects: "projects",
  "volunteering-experience": "volunteering",
  organizations: "organizations",
};

// Which single section a "/details/{slug}/" page is showing, or null off a details page (or
// an unrecognized slug, e.g. recommendations, which isn't modeled here).
export function detailsPageSection(url: string): ProfileSectionName | null {
  const match = /\/details\/([^/?#]+)/.exec(url);
  if (!match) return null;
  return DETAILS_PAGE_SLUGS[decodeURIComponent(match[1])] ?? null;
}

// Strips tracking params and resolves a relative href, keeping only what identifies the person
// and, if present, which details page. The same person's main profile and every one of their
// detail pages normalize predictably, so the crawler can compare URLs by exact string equality.
export function normalizeProfileUrl(url: string): string | null {
  const identity = profileIdentityKey(url);
  if (!identity) return null;
  const detailsMatch = /\/details\/([^/?#]+)/.exec(url);
  if (detailsMatch) return `https://www.linkedin.com/in/${identity}/details/${decodeURIComponent(detailsMatch[1])}/`;
  return `https://www.linkedin.com/in/${identity}/`;
}
