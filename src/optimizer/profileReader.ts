import { extractProfileShell, profileIdentityKey } from "../linkedin/profileAdapter";
import { recordProfileShell } from "./profileShellStore";

const STEP_PX = 700;
const STEP_DELAY_MS = 300;
const MAX_STEPS = 80;
// Consecutive checks at the bottom with no new content before the page counts as fully loaded.
const SETTLED_STEPS = 5;
const END_MARGIN_PX = 80;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// LinkedIn scrolls either the document or an inner <main>: whichever has the most to scroll.
function scrollContainer(doc: Document): Element {
  const candidates = [doc.scrollingElement, doc.querySelector("main")].filter((el): el is Element => el != null);
  return candidates.reduce((best, el) => (el.scrollHeight - el.clientHeight > best.scrollHeight - best.clientHeight ? el : best), candidates[0] ?? doc.documentElement);
}

// Scrolls the viewer's own profile from top to bottom until the page stops growing, so every lazily
// rendered section is seen, then returns to where the viewer was.
export async function readWholeProfile(doc: Document = document): Promise<void> {
  const profileKey = profileIdentityKey(doc.URL);
  if (!profileKey) return;
  const container = scrollContainer(doc);
  const start = container.scrollTop;
  let settledSteps = 0;
  let lastHeight = -1;
  for (let step = 0; step < MAX_STEPS && settledSteps < SETTLED_STEPS; step++) {
    container.scrollTop += STEP_PX;
    await sleep(STEP_DELAY_MS);
    // LinkedIn navigated elsewhere mid-read: this page isn't the profile being read.
    if (profileIdentityKey(doc.URL) !== profileKey) return;
    recordProfileShell(profileKey, extractProfileShell(doc), false);
    const atEnd = container.scrollTop + container.clientHeight >= container.scrollHeight - END_MARGIN_PX;
    settledSteps = atEnd && container.scrollHeight === lastHeight ? settledSteps + 1 : 0;
    lastHeight = container.scrollHeight;
  }
  if (profileIdentityKey(doc.URL) !== profileKey) return;
  recordProfileShell(profileKey, extractProfileShell(doc), true);
  container.scrollTop = start;
}
