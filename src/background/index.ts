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
 * Re-injects the content script into already-open LinkedIn tabs after a genuine install or
 * reload — so a routine rebuild-and-reload never needs the LinkedIn tab itself manually
 * refreshed on top of it. Safe to re-run on a tab that already has a (possibly orphaned,
 * post-reload) instance: content.ts's own teardown token cleans up any previous instance's
 * opener/panel/observers before setting up fresh ones, so this can never leave a duplicate
 * behind.
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
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/linkedin.js"] });
    } catch (error) {
      console.error("LinkWise: dev reinjection failed for tab", tab.id, error);
    }
  }
}

if (DEV_TOOLING_ENABLED) {
  chrome.runtime.onInstalled.addListener(() => {
    void reinjectIntoOpenLinkedInTabs();
  });
}
