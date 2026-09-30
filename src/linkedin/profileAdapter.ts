// The one file that queries LinkedIn's DOM. Every other module works with the LinkedInProfile
// type this produces, never a LinkedIn selector directly, so only one file needs to change
// when LinkedIn's markup changes.
//
// Reads only what's already rendered. Never fetches another page or expands a section itself.
import {
  ALL_PROFILE_SECTIONS,
  EMPTY_PROFILE,
  foundSections,
  type LinkedInProfile,
  type ProfileEducationEntry,
  type ProfileExperienceEntry,
  type ProfileListEntry,
  type ProfileSectionName,
} from "../models/profile";
import { groupCompany, parseEducationLines, parseExperienceLines, parseListLines, type EntryLine } from "./entryFields";

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
  { name: "languages", matches: (t) => t.startsWith("language") },
  { name: "honors", matches: (t) => t.includes("honor") || t.includes("award") },
];

function matcherFor(name: ProfileSectionName): (headingText: string) => boolean {
  return SECTION_MATCHERS.find((m) => m.name === name)!.matches;
}

// Exact heading texts, since a real entry like "AP Scholar Award" also contains "award".
const SECTION_HEADINGS: Record<ProfileSectionName, string[]> = {
  about: ["about"],
  experience: ["experience"],
  education: ["education"],
  skills: ["skills"],
  projects: ["projects"],
  certifications: ["licenses & certifications", "certifications", "licenses"],
  organizations: ["organizations"],
  volunteering: ["volunteering", "volunteer experience", "volunteering experience"],
  languages: ["languages"],
  honors: ["honors & awards", "honors and awards", "honors", "awards"],
};

function isSectionHeading(name: ProfileSectionName, text: string): boolean {
  return SECTION_HEADINGS[name].includes(text.toLowerCase().replace(/\(\d+\)/, "").trim());
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

function textWithoutControls(element: Element): string | undefined {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("button, svg").forEach((node) => node.remove());
  clone.querySelectorAll("br").forEach((node) => node.replaceWith(" "));
  return cleanText(clone.textContent);
}

// In newer layouts only grouped positions are list items, so single entries live beside them.
function textOutsideItems(section: HTMLElement, name: ProfileSectionName): string | undefined {
  const clone = section.cloneNode(true) as HTMLElement;
  const matches = matcherFor(name);
  clone.querySelectorAll("li, button, svg").forEach((node) => node.remove());
  clone.querySelectorAll("h2, h3").forEach((h) => {
    if (matches((h.textContent ?? "").trim().toLowerCase())) h.remove();
  });
  clone.querySelectorAll("br").forEach((node) => node.replaceWith(" "));
  clone.querySelectorAll("p").forEach((node) => node.append(" "));
  return cleanText(clone.textContent?.replace(/show all \d+ [a-z]+/gi, ""));
}

// Newer profile layouts render each entry line as a <p>, with aria-hidden reserved for controls
// like the "… more" button rather than a duplicate visible copy.
function entryLines(item: HTMLElement): string[] {
  const paragraphs = Array.from(item.querySelectorAll<HTMLElement>("p")).filter((p) => !p.querySelector("p"));
  const lines =
    paragraphs.length > 0
      ? paragraphs.map(textWithoutControls)
      : Array.from(item.querySelectorAll<HTMLElement>("span[aria-hidden='true'], div, span")).map((el) => visibleText(el));
  return [...new Set(lines.filter((text): text is string => Boolean(text)))];
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

// Prompts like "Verify in 2 minutes" or "Contact info" are links or buttons, never identity text.
function isInteractive(el: Element): boolean {
  return !!el.closest("a, button, [role='button'], [role='link']");
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
    if (el.querySelector("h1, h2, button, a, ul, li") || isInteractive(el)) continue;
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
    if (isInteractive(el)) continue;
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

const DESCRIPTION_BOX = '[data-testid="expandable-text-box"]';

interface DomLine extends EntryLine {
  item: Element | null;
}

// Media attached to an entry links off LinkedIn, and its title is not part of the entry.
function isAttachment(el: Element): boolean {
  const href = el.closest("a[href]")?.getAttribute("href") ?? "";
  return /^https?:\/\//i.test(href) && !/^https?:\/\/([a-z]+\.)?linkedin\.com\//i.test(href);
}

// An entry's lines in document order, null wherever an <hr> separates two entries.
function lineStream(root: HTMLElement): (DomLine | null)[] {
  const stream: (DomLine | null)[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`hr, p, ${DESCRIPTION_BOX}`))) {
    if (el.tagName === "HR") {
      stream.push(null);
      continue;
    }
    const box = el.matches(DESCRIPTION_BOX);
    if (box ? el.parentElement?.closest(DESCRIPTION_BOX) : el.querySelector(`p, ${DESCRIPTION_BOX}`) || el.closest(DESCRIPTION_BOX)) continue;
    if (isAttachment(el)) continue;
    const text = textWithoutControls(el);
    if (text) stream.push({ text, description: box, item: el.closest("li") });
  }
  return stream;
}

function entryBlocks(root: HTMLElement, name: ProfileSectionName): DomLine[][] {
  const blocks: DomLine[][] = [[]];
  for (const line of lineStream(root)) {
    if (!line) blocks.push([]);
    else if (!isSectionHeading(name, line.text) && !blocks.at(-1)!.some((l) => l.text === line.text)) blocks.at(-1)!.push(line);
  }
  return blocks.filter((block) => block.length > 0);
}

function blockItems(block: DomLine[]): Element[] {
  return [...new Set(block.map((line) => line.item).filter((item): item is Element => item !== null))];
}

// Several roles at one employer are list items under a header naming the employer.
function experienceFromBlock(block: DomLine[]): ProfileExperienceEntry[] {
  const items = blockItems(block);
  if (items.length === 0) return [parseExperienceLines(block)];
  const employer = groupCompany(block.filter((line) => !line.item));
  return items.map((item) => parseExperienceLines(block.filter((line) => line.item === item), employer));
}

function listFromBlock(block: DomLine[]): ProfileListEntry[] {
  const items = blockItems(block);
  if (items.length === 0) return [parseListLines(block)];
  return items.map((item) => parseListLines(block.filter((line) => line.item === item)));
}

function educationFromBlock(block: DomLine[]): ProfileEducationEntry[] {
  const items = blockItems(block);
  if (items.length === 0) return [parseEducationLines(block)];
  return items.map((item) => parseEducationLines(block.filter((line) => line.item === item)));
}

function structuredEntries<T extends object>(root: HTMLElement, name: ProfileSectionName, fromBlock: (block: DomLine[]) => T[]): T[] {
  return entryBlocks(root, name)
    .flatMap(fromBlock)
    .filter((entry) => Object.keys(entry).length > 0);
}

// Entries split by <hr>, or a single entry. Older layouts list every entry as an <li> instead.
function hasSeparatedEntries(section: HTMLElement): boolean {
  return !!section.querySelector("hr") || !section.querySelector("li");
}

function itemLines(item: HTMLElement): EntryLine[] {
  const lines = lineStream(item).filter((line): line is DomLine => line !== null);
  return lines.length > 0 ? lines : entryLines(item).map((text) => ({ text }));
}

function extractExperience(headings: HTMLElement[]): ProfileExperienceEntry[] {
  const section = findHeadingSection(headings, "experience");
  if (!section) return [];

  if (hasSeparatedEntries(section)) {
    const entries = structuredEntries(section, "experience", experienceFromBlock);
    if (entries.length > 0) return entries;
  }

  const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
  const entries = items.map((item) => parseExperienceLines(itemLines(item))).filter((entry) => Object.keys(entry).length > 0);
  if (entries.length > 0) {
    const rest = textOutsideItems(section, "experience");
    return rest ? [...entries, { description: rest }] : entries;
  }

  const body = sectionBodyText(section, "experience");
  return body ? [{ description: body }] : [];
}

function extractEducation(headings: HTMLElement[]): ProfileEducationEntry[] {
  const section = findHeadingSection(headings, "education");
  if (!section) return [];

  if (hasSeparatedEntries(section)) {
    const entries = structuredEntries(section, "education", educationFromBlock);
    if (entries.length > 0) return entries;
  }

  const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
  const entries = items.map((item) => parseEducationLines(itemLines(item))).filter((entry) => Object.keys(entry).length > 0);
  if (entries.length > 0) return entries;

  const body = sectionBodyText(section, "education");
  return body ? [{ school: body }] : [];
}

// Same "try li first, fall back to blob text" shape as Experience/Education, shared by every
// simple name-plus-description section.
function extractListEntries(headings: HTMLElement[], name: ProfileSectionName): ProfileListEntry[] {
  const section = findHeadingSection(headings, name);
  if (!section) return [];

  if (hasSeparatedEntries(section)) {
    const entries = structuredEntries(section, name, listFromBlock);
    if (entries.length > 0) return entries;
  }

  const items = Array.from(section.querySelectorAll<HTMLElement>("li"));
  if (items.length > 0) {
    const entries: ProfileListEntry[] = [];
    for (const item of items) {
      const unique = entryLines(item);
      if (unique.length === 0) continue;

      const [entryName, ...rest] = unique;
      const description = rest.find((line) => line.length > 20);
      const entry: ProfileListEntry = { name: cleanText(entryName), description: cleanText(description) };
      if (entry.name || entry.description) entries.push(entry);
    }
    if (entries.length > 0) {
      const rest = textOutsideItems(section, name);
      return rest ? [...entries, { description: rest }] : entries;
    }
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

export function findProfileSectionRoot(doc: Document, name: ProfileSectionName): HTMLElement | null {
  return findHeadingSection(Array.from(findMain(doc).querySelectorAll<HTMLElement>("h2, h3")), name);
}

function entryFromLines(section: ProfileSectionName, lines: string[]): Partial<LinkedInProfile> {
  const [first, second, ...rest] = lines;
  switch (section) {
    case "skills":
      return { skills: first ? [first] : [] };
    case "about":
      return { about: lines.join(" ") };
    default:
      return { [section]: [{ name: first, description: [second, ...rest].filter(Boolean).join(" · ") || undefined }] };
  }
}

// Entries are either siblings split by <hr>, or each wrapped with its own leading <hr>.
function detailsEntryList(doc: Document): HTMLElement | null {
  const first = doc.querySelector<HTMLElement>('[data-testid*="DetailsSection"] hr, main [componentkey*="profile.card"] hr');
  const scope = first?.closest<HTMLElement>('[data-testid*="DetailsSection"], [componentkey*="profile.card"]');
  if (!first || !scope) return null;
  const separators = Array.from(scope.querySelectorAll("hr"));
  const holdsAll = (el: HTMLElement) => separators.every((hr) => el.contains(hr));
  let list = first.parentElement;
  while (list && list !== scope && !holdsAll(list)) list = list.parentElement;
  if (list && list === first.parentElement && !first.previousElementSibling && list !== scope) list = list.parentElement;
  return list;
}

// The element holding a details page's own entries, for scoping work to that section only.
export function findDetailsSectionRoot(doc: Document = document): HTMLElement | null {
  if (!detailsPageSection(doc.URL)) return null;
  return doc.querySelector<HTMLElement>('[data-testid*="DetailsSection"]') ?? detailsEntryList(doc);
}

// The parts of a profile page that describe the person: the details list on a details page, or
// the top card and profile sections on the main page. Never navigation, sidebars, or activity.
export function findProfileContentRoots(doc: Document = document): HTMLElement[] {
  if (detailsPageSection(doc.URL)) {
    const root = findDetailsSectionRoot(doc);
    return root ? [root] : [];
  }
  const main = findMain(doc);
  const heading = findIdentityHeading(main);
  const headings = Array.from(main.querySelectorAll<HTMLElement>("h2, h3"));
  const roots = [heading ? findIdentityCardContainer(heading) : null, ...ALL_PROFILE_SECTIONS.map((name) => findHeadingSection(headings, name))];
  const unique = [...new Set(roots.filter((root): root is HTMLElement => root !== null && root !== main))];
  return unique.filter((root) => !unique.some((other) => other !== root && other.contains(root)));
}

// Newer "/details/{section}/" pages have no section heading, just a profile card listing
// entries separated by <hr>. Reads only those entries, never the top card or sidebar.
export function extractDetailsPageProfile(doc: Document = document): LinkedInProfile {
  const section = detailsPageSection(doc.URL);
  const container = doc.querySelector<HTMLElement>('[data-testid*="DetailsSection"]');
  const list = detailsEntryList(doc);
  if (!section || (!list && !container)) return extractLinkedInProfile(doc);

  const profile: LinkedInProfile = { ...EMPTY_PROFILE, experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] };
  if (section !== "skills" && section !== "about") {
    const root = (container ?? list)!;
    if (section === "experience") profile.experience = structuredEntries(root, section, experienceFromBlock);
    else if (section === "education") profile.education = structuredEntries(root, section, educationFromBlock);
    else profile[section] = structuredEntries(root, section, listFromBlock);
    profile.extracted = foundSections(profile).length > 0;
    return profile;
  }

  const entries = list ? Array.from(list.children).filter((el): el is HTMLElement => el.tagName !== "HR") : [container!];
  for (const entry of entries) {
    const lines = entryLines(entry);
    if (lines.length > 0 && isSectionHeading(section, lines[0]!)) lines.shift();
    if (lines.length === 0) continue;
    const part = entryFromLines(section, lines);
    for (const [key, value] of Object.entries(part)) {
      const existing = profile[key as keyof LinkedInProfile];
      (profile as unknown as Record<string, unknown>)[key] = Array.isArray(existing) && Array.isArray(value) ? [...existing, ...value] : value;
    }
  }
  profile.extracted = foundSections(profile).length > 0;
  return profile;
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
  // LinkedIn's real read-only route is plural ("volunteering-experiences"). The distinct
  // singular "volunteer-experiences" slug only ever appears in its edit-form deep links, which
  // isProfileManagementUrl already rejects before a URL reaches this map.
  "volunteering-experiences": "volunteering",
  organizations: "organizations",
};

// The raw "/details/{slug}/" segment itself, decoded, or null off a details page.
export function detailsPageSlug(url: string): string | null {
  const match = /\/details\/([^/?#]+)/.exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}

// Which single section a "/details/{slug}/" page is showing, or null off a details page (or
// an unrecognized slug, e.g. recommendations, which isn't modeled here).
export function detailsPageSection(url: string): ProfileSectionName | null {
  const slug = detailsPageSlug(url);
  return slug ? (DETAILS_PAGE_SLUGS[slug] ?? null) : null;
}

// LinkedIn's own profile-management routes: editing an entry ("/edit/forms/12345/"), adding one
// ("/edit/forms/new/"), or any other add/create form. The crawler only ever reads a profile, it
// never opens editing or add/create UI, whatever slug that UI happens to live under.
export function isProfileManagementUrl(url: string): boolean {
  return /\/edit(\/|$)|\/forms\/new(\/|$)|\/(add|create)(\/|$)/.test(url);
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
