// Lifecycle and orchestration only, no product logic here. The whole UI lives in the LinkedIn
// content script's in-page panel. This worker's only job is relaying AI requests, since the
// content script can't fetch the backend directly.
import { installAiRelay } from "./aiRelay";

installAiRelay();

// Dev-only tooling below. Must be flipped off before this extension ships anywhere real.
const DEV_TOOLING_ENABLED = true;

const DEV_RELOAD_REQUEST = "__linkwise_dev_reload__";

// chrome.runtime.reload() isn't available to content scripts, only here.
// devTools.ts relays a request instead of calling it directly.
if (DEV_TOOLING_ENABLED) {
  chrome.runtime.onMessage.addListener((message: { type?: unknown }) => {
    if (message?.type === DEV_RELOAD_REQUEST) {
      chrome.runtime.reload();
    }
    return false;
  });
}

// Re-injects the content script into open LinkedIn tabs after an install or reload, so a
// rebuild never needs a manual page refresh. Safe to re-run since runtimeTakeover.ts tears
// down any previous instance first.
//
// Wired to onInstalled specifically, not every service worker wake-up. The worker restarts on
// ordinary events too (like an AI relay message), and reinjecting then would tear down the
// panel/analysis run that just woke it up.
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
