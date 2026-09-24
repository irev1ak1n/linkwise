// Expands LinkedIn's own "…see more" / "…more" toggles inside profile content before
// extraction reads it, so long About/Experience/Education/Honors descriptions aren't cut off.
//
// Matching the toggle's own text was never enough by itself: LinkedIn's Activity widget on a
// profile page shows recent posts, and its own "…see more" reads identically, but clicking it
// can navigate the whole page to /feed/update/... and knock LinkWise off the profile entirely
// (confirmed live). The real safety check is which CONTAINER owns the control, not what the
// control says. This only ever clicks a toggle whose nearest recognized-heading <section>
// ancestor — walking outward through nested sections, see isWithinRecognizedProfileSection — has
// a heading LinkWise already recognizes as real profile information (see profileAdapter.ts's own
// section list). Activity, posts, ads, job cards, and every other LinkedIn widget simply never
// sit inside one of those headings, so they're excluded by construction, not by name-matching
// them directly. LinkedIn's real wording varies a little ("…see more", "see more", "…more"), but
// it's always a short trailing toggle, never a long sentence, so length keeps this from matching
// unrelated buttons that merely contain the word "more".
//
// A "/details/{section}/" page (confirmed live) doesn't wrap its content in <section> at all —
// the whole page IS that one section, in plain unlabeled <div>s — so the <section>-heading check
// above used to find nothing there and reject everything on those pages.
// isWithinRecognizedProfileSection also recognizes this case via the URL itself
// (profileAdapter.ts's own detailsPageSection, which only ever resolves a real, already-
// recognized section slug), and excludes the landmarks confirmed live to hold non-content chrome
// on both page types: <aside> (the right rail — ads, "who viewed", language picker), <header>
// and <nav> (the one "more"-shaped button found on a details page in testing was the site's own
// top-nav overflow menu, sitting inside both).
//
// "Analyze as I scroll" must never move the user's viewport to reach a toggle (confirmed live:
// clicking a <button> moves focus to it, and a browser nudges scroll position to bring a
// partially-visible focused element fully into view — no explicit scrollIntoView/scrollTo call
// was involved). So in that mode a toggle is only eligible once it's already substantially
// visible, never searched for page-wide and then scrolled to; see isWithinViewport and the
// restrictToViewport option below. "Auto scan" has no such restriction, since it drives
// scrolling itself and is expected to reach every section anyway. As a last line of defense
// against the expansion's own layout reflow, the restricted path also preserves the visual
// position of a stable anchor near the toggle — see clickPreservingScroll.
const SEE_MORE_PATTERN = /^(…|\.\.\.)?\s*(see more|more)$/i;
const MAX_TOGGLE_TEXT_LENGTH = 20;

// The only sections this is ever allowed to expand into, matching profileAdapter.ts's own
// heading recognition. An allowlist, not a blocklist: anything not on this list (Activity,
// posts, ads, "People you may know", job cards, ...) is refused by default, never guessed at.
// Unanchored substring matches on purpose: LinkedIn's real headings sometimes carry extra
// accessibility text (a duplicated visually-hidden copy, an item count) around the visible
// label, and an exact `^projects$`-style match silently rejected a real Projects heading that
// wasn't a bare, plain "Projects" string (confirmed live).
const SAFE_SECTION_HEADING_PATTERNS: RegExp[] = [
  /about/,
  /experience/,
  /education/,
  /skills/,
  /projects/,
  /certification|licenses?/,
  /organizations?/,
  /volunteer/,
  /languages?/,
  /honou?rs?|awards?/,
];

function isSafeSectionHeading(headingText: string): boolean {
  const normalized = headingText.trim().toLowerCase();
  if (!normalized) return false;
  return SAFE_SECTION_HEADING_PATTERNS.some((pattern) => pattern.test(normalized));
}

// A route this must never auto-navigate into, wherever it might show up: an actual href on
// the control, or the control secretly being a link despite looking like a button.
const UNSAFE_NAVIGATION_HREF_PATTERN = /\/(feed\/update|posts|pulse|company|jobs)\//i;

// Already-clicked toggles are tracked by reference, so a toggle that LinkedIn leaves in the DOM
// after expanding (common: it just becomes hidden or turns into "see less") is never re-clicked.
const alreadyExpanded = new WeakSet<Element>();

function isSeeMoreToggle(button: HTMLButtonElement): boolean {
  const text = (button.textContent ?? "").trim();
  if (!text || text.length > MAX_TOGGLE_TEXT_LENGTH) return false;
  return SEE_MORE_PATTERN.test(text);
}

// A section "owns" a heading only if that heading isn't itself inside a deeper nested <section>.
// A Projects entry commonly wraps itself in its own inner <section> with the project's own name
// as an h3 (confirmed live) — that inner section's "own" heading is the project's name, not
// "Projects", so it correctly fails the safe-heading check below, and
// isWithinRecognizedProfileSection keeps walking out to the real Projects wrapper instead of
// giving up at the first (innermost) section it finds.
function ownHeadingText(section: Element): string | null {
  const headings = Array.from(section.querySelectorAll("h2, h3"));
  const ownHeading = headings.find((heading) => heading.closest("section") === section);
  return ownHeading?.textContent ?? null;
}

// Never real profile content on either page type (confirmed live): the right-rail sidebar
// (<aside> — ads, "who viewed", language picker) and the site's own global chrome (<header>,
// <nav> — a details page's only "more"-shaped button was the top-nav overflow menu, inside both).
function isInsideExcludedLandmark(button: HTMLButtonElement): boolean {
  return button.closest("aside") !== null || button.closest("header") !== null || button.closest("nav") !== null;
}

// The same fixed set of legitimate LinkedIn "/details/{slug}/" URL slugs profileAdapter.ts's own
// detectProfileSections recognizes as real sections — never anything guessed from arbitrary URL
// text. Kept local to this file rather than imported, since this module must stay expandable
// into its own isolated commit independent of the rest of the profile-detail-crawling feature.
const DETAILS_PAGE_SLUGS = new Set([
  "experience",
  "education",
  "skills",
  "languages",
  "honors",
  "certifications",
  "projects",
  "volunteering-experience",
  "organizations",
]);

function isRecognizedDetailsPageUrl(url: string): boolean {
  const match = /\/details\/([^/?#]+)/.exec(url);
  return match !== null && DETAILS_PAGE_SLUGS.has(decodeURIComponent(match[1]));
}

// Step 1 & 2: find the owning container, then decide whether it's real profile information.
// Walks outward through every ancestor <section>, not just the nearest one, since a safe section
// can itself contain per-entry sections with their own unrelated heading (see ownHeadingText). A
// control with no recognized section anywhere in its ancestry — an ad, a floating widget,
// anything not shaped like a profile section — is refused by default rather than guessed at.
//
// A "/details/{section}/" page has no <section> wrapper at all (confirmed live), so the walk
// above always comes up empty there; isRecognizedDetailsPageUrl(doc.URL) recognizes that case
// instead, resolving only an already-known, legitimate section slug — so the whole
// (landmark-excluded) page counts as that one section.
function isWithinRecognizedProfileSection(button: HTMLButtonElement, main: Element, doc: Document): boolean {
  if (!main.contains(button)) return false;
  if (isInsideExcludedLandmark(button)) return false;

  let section: Element | null = button.closest("section");
  while (section) {
    if (isSafeSectionHeading(ownHeadingText(section) ?? "")) return true;
    section = section.parentElement?.closest("section") ?? null;
  }

  return isRecognizedDetailsPageUrl(doc.URL);
}

// Step 3 & 4: even inside a recognized section, the control itself must actually be a plain
// inline toggle, never something that would navigate the page away from the profile.
function wouldNavigateAway(button: HTMLButtonElement): boolean {
  if (button.getAttribute("role") === "link") return true;
  if (button.closest("a[href]")) return true;
  const href = button.getAttribute("href");
  if (href && UNSAFE_NAVIGATION_HREF_PATTERN.test(href)) return true;
  // A LinkedIn button whose click handler performs a client-side route change instead of a
  // real href commonly still marks its destination on itself for accessibility/analytics.
  for (const attr of ["data-control-name", "data-tracking-control-name", "aria-label"]) {
    const value = button.getAttribute(attr);
    if (value && UNSAFE_NAVIGATION_HREF_PATTERN.test(value)) return true;
  }
  return false;
}

// Step 5: only click when every check above passes.
function isSafeToExpand(button: HTMLButtonElement, main: Element, doc: Document): boolean {
  if (!isWithinRecognizedProfileSection(button, main, doc)) return false;
  if (wouldNavigateAway(button)) return false;
  return true;
}

// How much of the viewport a toggle may fall outside of and still count as "naturally visible."
// Small on purpose: a control that's only barely clipped at an edge is exactly the case where a
// browser's own focus-visibility behavior would nudge scroll to reveal it fully, which is the
// movement this whole gate exists to prevent.
const VIEWPORT_VISIBILITY_MARGIN_PX = 40;

// Only meaningful for "Analyze as I scroll" (restrictToViewport: true). A toggle must already be
// substantially on-screen to be eligible — never scanned for page-wide and then scrolled to.
function isWithinViewport(button: HTMLButtonElement): boolean {
  const rect = button.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return rect.top >= -VIEWPORT_VISIBILITY_MARGIN_PX && rect.bottom <= viewportHeight + VIEWPORT_VISIBILITY_MARGIN_PX;
}

// Duplicated from content.ts's own findScrollContainer rather than imported (content.ts already
// imports this module, importing back would be circular). LinkedIn doesn't always scroll the
// document itself, sometimes an inner <main> scrolls instead.
function findScrollContainer(doc: Document): Element {
  const candidates = [doc.scrollingElement, doc.querySelector("main")].filter((el): el is Element => el != null);
  for (const candidate of candidates) {
    if (candidate.scrollHeight - candidate.clientHeight > 40) return candidate;
  }
  return doc.scrollingElement ?? doc.documentElement;
}

// A reference point near the toggle whose own on-screen position doesn't move just because the
// toggle's own text grows below/after it inside the same entry — the entry's whole block, not
// the button itself (the revealed text is inserted at the button's own position and pushes IT
// down as part of the intended reveal; anchoring on the button would fight that expected
// movement, not just the unwanted kind).
function findStableAnchor(button: HTMLButtonElement): Element {
  return button.closest("li") ?? button.closest("section") ?? button.parentElement ?? button;
}

// Clicks a toggle that's already known to be visible, then corrects for exactly whatever
// extraneous vertical shift the click caused — never a blind reset to an old absolute scroll
// position, which would fight the user if they scrolled on their own during the (async)
// expansion. An element's rect.top is (its position in the document) minus (the container's
// scrollTop), so comparing the anchor's rect.top *and* the container's scrollTop together,
// before and after, isolates exactly how much the anchor's own document position moved —
// independent of whatever the user's own scrolling contributed in between. That's why no
// separate "is the user actively scrolling" check is needed: the correction is already exactly
// zero whenever nothing but the user's own scroll moved the anchor (confirmed by the math, see
// expandContent.test.ts).
//
// Native browser scroll anchoring is the browser's own heuristic for this same problem; running
// both at once can still fight each other (a residual movement was confirmed live even with the
// visibility gate alone), so it's disabled on the container for the duration of this one
// expansion and restored immediately after.
function clickPreservingScroll(button: HTMLButtonElement, doc: Document): void {
  const container = findScrollContainer(doc) as HTMLElement;
  const anchor = findStableAnchor(button);
  // Mutable, not a fixed pre-click snapshot: each compensate() call moves the baseline forward
  // to whatever it just corrected to, so a later call only reacts to shifts that happen AFTER
  // that point — otherwise it would re-detect (and re-apply) the very correction it just made.
  let scrollBaseline = container.scrollTop;
  let rectBaseline = anchor.getBoundingClientRect().top;
  const previousOverflowAnchor = container.style.getPropertyValue("overflow-anchor");
  container.style.setProperty("overflow-anchor", "none");

  const compensate = (): void => {
    const scrollNow = container.scrollTop;
    const rectNow = anchor.getBoundingClientRect().top;
    const layoutShift = rectNow - rectBaseline + (scrollNow - scrollBaseline);
    if (Math.abs(layoutShift) > 0.5) container.scrollTop = scrollNow + layoutShift;
    scrollBaseline = container.scrollTop;
    rectBaseline = anchor.getBoundingClientRect().top;
  };

  button.click();
  button.blur(); // removes focus rather than leaving it on a now-hidden/relabeled toggle
  compensate(); // covers any synchronous reflow from the click itself

  // LinkedIn expands the text via its own async render, so the real layout change usually
  // hasn't happened yet on this same tick.
  window.requestAnimationFrame(() => {
    compensate();
    if (previousOverflowAnchor) {
      container.style.setProperty("overflow-anchor", previousOverflowAnchor);
    } else {
      container.style.removeProperty("overflow-anchor");
    }
  });
}

export interface ExpandOptions {
  /** True for "Analyze as I scroll": only expand a toggle that's already substantially visible,
   * and never move the viewport to reach or compensate for one. False (the default) for "Auto
   * scan", which already drives scrolling itself and may expand anything found on the page. */
  restrictToViewport?: boolean;
}

// Finds and clicks every not-yet-expanded, safe "see more" toggle on the current page. Returns
// how many were clicked, so a caller can log or bound repeated calls. Caps how many it clicks
// in one pass, a runaway page should never turn into an unbounded click loop.
const MAX_EXPANSIONS_PER_CALL = 25;

export function expandSeeMoreToggles(doc: Document = document, options: ExpandOptions = {}): number {
  const { restrictToViewport = false } = options;
  const main = doc.querySelector<HTMLElement>('main[role="main"], main') ?? doc.body;
  const buttons = Array.from(main.querySelectorAll<HTMLButtonElement>("button"));
  let expanded = 0;
  for (const button of buttons) {
    if (expanded >= MAX_EXPANSIONS_PER_CALL) break;
    if (alreadyExpanded.has(button)) continue;
    if (!isSeeMoreToggle(button)) continue;
    if (!isSafeToExpand(button, main, doc)) continue;
    if (restrictToViewport && !isWithinViewport(button)) continue;

    alreadyExpanded.add(button);
    if (restrictToViewport) {
      clickPreservingScroll(button, doc);
    } else {
      button.click();
    }
    expanded += 1;
  }
  return expanded;
}

// Exported only for tests, so the container/navigation/viewport rules can be verified directly
// rather than only indirectly through DOM fixtures.
export const _internal = {
  isSafeSectionHeading,
  wouldNavigateAway,
  isWithinViewport,
  ownHeadingText,
  isInsideExcludedLandmark,
  isRecognizedDetailsPageUrl,
};
