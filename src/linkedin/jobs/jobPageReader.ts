// Reads the job LinkedIn is showing: which job it is, its whole text with the collapsed parts opened,
// and the lines of its top card. LinkedIn's markup is obfuscated and changes between layouts, so this
// leans on what stays put: the job id in the URL, the "About the job" and "About the company"
// headings, and the "… more" controls, and falls back to older layouts' containers.
import type { JobPosting } from "../../jobs/jobTypes";

const ABOUT_JOB_KEY = '[componentkey^="JobDetails_AboutTheJob_"]';
const DETAIL_FALLBACKS = [".jobs-search__job-details--container", ".jobs-details", ".job-view-layout", ".scaffold-layout__detail"];
const MORE_BUTTONS = ['[data-testid="expandable-text-button"]', "button.jobs-description__footer-button", "button.show-more-less-html__button--more", 'button[aria-label*="see more" i]', 'button[aria-label*="show more" i]'];
// "… more" is only ever pressed inside the posting's own description and company sections. The details
// panel also holds hiring posts and links with a "more" of their own, and pressing one of those opens
// that post and leaves the job.
const POSTING_SECTIONS = '[componentkey^="JobDetails_AboutTheJob_"], [componentkey^="JobDetails_AboutTheCompany_"], .jobs-description, .jobs-company, .jobs-description__container';
const MORE_TEXT = /^(…|\.\.\.)?\s*(see |show )?more$/i;
const DESCRIPTION_NOISE = /^(…|\.\.\.)?\s*(see |show )?(more|less)$/i;
const HEADER_NOISE = /^(apply|easy apply|save|saved|show match details|beta|.*is this information helpful.*|your profile and resume match.*|promoted by hirer.*|share|more options)$/i;
const MIN_DESCRIPTION = 30;
const COMPANY_END = /^(interested in working with us|company photos|unlock hiring insights|get the linkedin app|show all|meet the hiring team|set alert for similar jobs)/i;

/** The id of the job on screen: the URL's, which LinkedIn updates when another job is clicked. */
export function currentJobId(href: string, doc: Document): string | null {
  const url = (() => {
    try {
      return new URL(href);
    } catch {
      return null;
    }
  })();
  const fromParam = url?.searchParams.get("currentJobId");
  if (fromParam && /^\d+$/.test(fromParam)) return fromParam;
  const fromPath = url?.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})/)?.[1];
  if (fromPath) return fromPath;
  const key = doc.querySelector(ABOUT_JOB_KEY)?.getAttribute("componentkey")?.match(/_(\d+)$/)?.[1];
  return key ?? null;
}

/** The panel that holds the open job's details: the part of the page to read, expand, and highlight. */
export function findJobDetails(doc: Document): HTMLElement | null {
  const about = doc.querySelector(ABOUT_JOB_KEY);
  if (about) return (about.closest('[data-testid="lazy-column"]') as HTMLElement | null) ?? (about.parentElement?.parentElement as HTMLElement | null) ?? (about as HTMLElement);
  for (const selector of DETAIL_FALLBACKS) {
    const found = doc.querySelector<HTMLElement>(selector);
    if (found) return found;
  }
  return /\/jobs\/view\//.test(doc.location?.href ?? "") ? doc.querySelector<HTMLElement>("main") : null;
}

// LinkedIn clamps a long text to a few lines. The words are in the page either way, but a clamped
// section is not shown in full, so it is opened before reading and before anything is highlighted.
function isClamped(button: HTMLElement): boolean {
  const box = button.closest<HTMLElement>('[data-testid="expandable-text-box"]') ?? button.parentElement;
  if (!box) return true;
  return box.scrollHeight > box.clientHeight + 2 || box.clientHeight === 0;
}

const clicked = new WeakSet<Element>();

// Opening a section makes LinkedIn scroll the page to it. The user did not ask to go anywhere, so
// wherever the page and its scrolling panels were is restored, at once and again after LinkedIn's own scroll.
function keepScrollPositions(root: ParentNode): () => void {
  const saved: [Element | Window, number, number][] = [[window, window.scrollX, window.scrollY]];
  for (let el = root instanceof Element ? root : null; el; el = el.parentElement) if (el.scrollTop > 0 || el.scrollHeight > el.clientHeight + 1) saved.push([el, el.scrollLeft, el.scrollTop]);
  const restore = () => {
    for (const [target, left, top] of saved) {
      if (target instanceof Window) target.scrollTo(left, top);
      else {
        target.scrollLeft = left;
        target.scrollTop = top;
      }
    }
  };
  return () => {
    restore();
    setTimeout(restore, 120);
    setTimeout(restore, 400);
    setTimeout(restore, 900);
  };
}

/** Opens collapsed sections once each; returns how many it opened. Never re-clicks an opened control. */
export function expandCollapsed(root: ParentNode): number {
  let opened = 0;
  const restoreScroll = keepScrollPositions(root);
  const candidates = new Set<HTMLElement>();
  const scopes = [...(root instanceof Element && root.matches(POSTING_SECTIONS) ? [root] : []), ...root.querySelectorAll<HTMLElement>(POSTING_SECTIONS)];
  for (const scope of scopes) {
    for (const selector of MORE_BUTTONS) scope.querySelectorAll<HTMLElement>(selector).forEach((b) => candidates.add(b));
    scope.querySelectorAll<HTMLElement>("button").forEach((b) => {
      if (MORE_TEXT.test((b.textContent ?? "").trim().replace(/\s+/g, " "))) candidates.add(b);
    });
  }
  for (const button of candidates) {
    // A link is navigation, never an expander.
    if (button.closest("a[href]") || button.hasAttribute("href")) continue;
    if (clicked.has(button) || button.getAttribute("aria-expanded") === "true" || button.closest("[data-lw-ignore]")) continue;
    if (button.hasAttribute("disabled") || !isClamped(button)) continue;
    clicked.add(button);
    button.click();
    opened += 1;
  }
  if (opened > 0) restoreScroll();
  return opened;
}

// innerText follows what is on screen; jsdom has none, so tests fall back to a block-aware walk.
const BLOCKS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "SECTION", "BR", "TR", "ARTICLE", "HEADER"]);
export function visibleText(element: HTMLElement): string {
  if (typeof element.innerText === "string" && element.innerText.length > 0) return element.innerText;
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node instanceof HTMLElement) {
      if (["SCRIPT", "STYLE", "SVG"].includes(node.tagName.toUpperCase()) || node.hasAttribute("data-lw-ignore") || node.getAttribute("aria-hidden") === "true") return;
      const block = BLOCKS.has(node.tagName);
      if (block) out += "\n";
      node.childNodes.forEach(walk);
      if (block) out += "\n";
    }
  };
  walk(element);
  return out;
}

const toLines = (text: string) => text.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

function titleAndCompany(doc: Document): { title: string; company: string } {
  const parts = doc.title.replace(/\s*\|\s*LinkedIn\s*$/i, "").split(" | ");
  if (parts.length >= 2 && parts[0]) return { title: parts[0].trim(), company: parts[1]!.trim() };
  return { title: doc.querySelector("h1")?.textContent?.trim() ?? parts[0] ?? "", company: "" };
}

/** The open job as plain text, or null when the page doesn't show one yet. Expansion is separate. */
export function readJobPosting(doc: Document, href: string): JobPosting | null {
  const jobId = currentJobId(href, doc);
  const root = findJobDetails(doc);
  if (!jobId || !root) return null;
  const lines = toLines(visibleText(root));
  const about = lines.findIndex((line) => /^about the job$/i.test(line));
  const company = lines.findIndex((line, i) => i > about && /^about the company$/i.test(line));
  const descriptionEnd = company === -1 ? lines.length : company;
  const description = (about === -1 ? lines : lines.slice(about + 1, descriptionEnd)).filter((line) => !DESCRIPTION_NOISE.test(line)).join("\n");
  const companyLines = company === -1 ? [] : lines.slice(company + 1);
  const companyEnd = companyLines.findIndex((line) => COMPANY_END.test(line));
  const companyText = (companyEnd === -1 ? companyLines : companyLines.slice(0, companyEnd)).filter((line) => !DESCRIPTION_NOISE.test(line)).join("\n");
  const headerLines = (about === -1 ? [] : lines.slice(0, about)).filter((line) => !HEADER_NOISE.test(line)).slice(0, 30);
  const { title, company: companyName } = titleAndCompany(doc);
  // A panel still loading shows a top card and no description yet; reading it now would analyze a skeleton.
  if (about === -1 && root.querySelector(ABOUT_JOB_KEY)) return null;
  if (description.length < MIN_DESCRIPTION) return null;
  return { jobId, url: href, title, company: companyName || headerLines[0] || "", headerLines, description, companyText };
}
