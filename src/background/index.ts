// Lifecycle/orchestration only — no product business logic here.
// LinkWise has no browser-level UI of its own anymore (no side panel, no popup) — the whole
// interface (goal setup, profile scanning, match analysis) lives entirely on the LinkedIn page
// itself (see linkedin/content.ts, linkedin/panel/), an in-page panel the content script mounts
// directly. The one exception is the AI analysis relay below: the content script can never
// fetch the LinkWise backend directly (see ai/analyzeProfileClient.ts's doc comment), so this
// background worker does that one thing on its behalf.
import { installAiRelay } from "./aiRelay";

installAiRelay();

/**
 * Development-only tooling — both pieces below must be flipped off (DEV_TOOLING_ENABLED =
 * false) before this extension is ever distributed anywhere real. Declarative content_scripts
 * in the manifest already handle real page loads on their own; everything here exists only to
 * smooth out local development.
 */
const DEV_TOOLING_ENABLED = true;

const DEV_RELOAD_REQUEST = "__linkwise_dev_reload__";

/** `chrome.runtime.reload()` is not available to content scripts (confirmed live —
 * "chrome.runtime.reload is not a function" when called from linkedin/content.ts) — only
 * genuine extension pages and this service worker have the full runtime API. content.ts's
 * devTools.ts relays a request here via chrome.runtime.sendMessage instead of ever calling
 * reload() itself. */
if (DEV_TOOLING_ENABLED) {
  chrome.runtime.onMessage.addListener((message: { type?: unknown }) => {
    if (message?.type === DEV_RELOAD_REQUEST) {
      chrome.runtime.reload();
    }
    return false;
  });
}

/**
 * Whether a `chrome.scripting.executeScript` rejection is an ordinary navigation race rather
 * than a genuine failure. `chrome.tabs.query` and `chrome.scripting.executeScript` are two
 * separate async calls with no atomicity between them — by the time injection actually runs, a
 * tab from that snapshot may have already navigated away, reloaded, or closed, and Chrome
 * reports that as one of a small set of well-known messages ("Frame with ID ... was removed",
 * "No tab with id", "The tab was closed", or a frame no longer existing). Confirmed live:
 * exactly this fires during ordinary use (a LinkedIn tab client-side-navigating at the same
 * moment a reload's reinjection sweep runs), not from anything actually broken — logging it as
 * `console.error` misrepresented a routine race as a LinkWise bug. */
function isExpectedInjectionRace(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /frame with id \S+ was removed|no tab with id|no frame with id|the tab was closed|cannot access a chrome[:.]|cannot be scripted/i.test(
    message,
  );
}

/**
 * Re-injects the content script into already-open LinkedIn tabs after a genuine install or
 * reload — so a routine rebuild-and-reload never needs the LinkedIn tab itself manually
 * refreshed on top of it. Safe to re-run on a tab that already has a (possibly orphaned,
 * post-reload) instance: content.ts's own teardown token cleans up any previous instance's
 * opener/panel/observers before setting up fresh ones, so this can never leave a duplicate
 * behind. Getting this to actually succeed matters beyond just refreshing the UI: a tab whose
 * reinjection fails keeps running its OLD, orphaned content-script instance indefinitely (until
 * the next successful reload sweep), and that orphaned instance's own `chrome.runtime` calls can
 * start failing in confusing ways once its extension context is invalidated.
 *
 * Deliberately wired to `chrome.runtime.onInstalled`, NOT run unconditionally every time this
 * service worker (re)starts — confirmed live, an MV3 service worker gets stopped after a short
 * idle period and restarts on the next event it handles (here, most commonly the AI-analysis
 * relay message an in-progress profile view sends a few seconds after opening). Reinjecting on
 * every one of THOSE ordinary wake-ups tore down the very panel/analysis run that had just
 * triggered the wake-up, losing all its in-memory state moments before it could finish.
 * `onInstalled` fires only for what this is actually meant to catch: the extension being loaded
 * for the first time, or reloaded (including via `chrome.runtime.reload()` below) — never a
 * plain idle-then-woken-by-a-message cycle.
 */
async function reinjectIntoOpenLinkedInTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://*.linkedin.com/*" });
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const tabId = tab.id;
    try {
      // Re-checking right before injecting narrows (never fully closes) the race window between
      // the query above and the injection below — cheap insurance against injecting into a tab
      // that already moved on to a different, non-matching page.
      const current = await chrome.tabs.get(tabId).catch(() => null);
      if (!current || !current.url?.startsWith("https://") || !/\blinkedin\.com\b/.test(current.url)) continue;

      await chrome.scripting.executeScript({ target: { tabId }, files: ["content/linkedin.js"] });
    } catch (error) {
      if (isExpectedInjectionRace(error)) continue;
      console.error("LinkWise: dev reinjection failed for tab", tabId, error);
    }
  }
}

if (DEV_TOOLING_ENABLED) {
  chrome.runtime.onInstalled.addListener(() => {
    void reinjectIntoOpenLinkedInTabs();
  });
}
