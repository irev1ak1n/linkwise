// Dev-only tooling: lets a test harness trigger a reload and inspect content-script state
// without touching chrome://extensions by hand.
//
// Two bridges: window.postMessage between the page world and this isolated content script, and
// chrome.runtime.sendMessage to the background worker, since content scripts can't call
// chrome.runtime.reload() themselves.
//
// Gated behind DEV_TOOLING_ENABLED, must be off before this ships anywhere real.
const DEV_TOOLING_ENABLED = true;

const RELOAD_REQUEST = "__linkwise_dev_reload__";
const SNAPSHOT_REQUEST = "__linkwise_dev_snapshot_request__";
const SNAPSHOT_RESPONSE = "__linkwise_dev_snapshot_response__";

// Returns an unsubscribe function so a re-injected instance doesn't leave a stale listener.
export function installDevTooling(getSnapshot: () => unknown): () => void {
  if (!DEV_TOOLING_ENABLED) return () => {};

  function handleMessage(event: MessageEvent): void {
    if (event.source !== window) return;
    const data = event.data as { type?: unknown } | undefined;
    if (!data || typeof data !== "object") return;

    if (data.type === RELOAD_REQUEST) {
      // Relay only, this content script can't reload itself.
      chrome.runtime.sendMessage({ type: RELOAD_REQUEST }).catch(() => {
        // Background may be mid-restart already, nothing to do about a lost relay.
      });
    }
    if (data.type === SNAPSHOT_REQUEST) {
      window.postMessage({ type: SNAPSHOT_RESPONSE, snapshot: getSnapshot() }, "*");
    }
  }

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}
