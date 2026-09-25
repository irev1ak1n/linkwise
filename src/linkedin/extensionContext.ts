// Detects when this content script's connection to the extension has died: after the
// extension reloads, updates, or is disabled, chrome.runtime.id becomes unreadable, and every
// chrome.* call from a stale script afterward either throws or rejects with "Extension context
// invalidated." There's no native event for this, so it has to be checked for directly.
//
// This is exactly the scenario a dev-reload cycle produces on purpose (the old content script
// keeps running for a moment after the extension it was talking to is gone), which is why
// heavy use of the dev-reload workflow surfaced this: "Cannot read properties of undefined
// (reading 'onChanged')" is chrome.storage itself having gone undefined, and "Extension context
// invalidated" is Chrome's own error from an in-flight or new API call — the same root cause,
// not two separate bugs.

// True while chrome.runtime and its id are still reachable. False once the context is gone.
// Wrapped in try/catch because reading chrome.runtime.id can itself throw once invalidated,
// not just return undefined.
export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined" && typeof chrome.runtime.id === "string";
  } catch {
    return false;
  }
}

// Matches Chrome's own wording for this specific failure, so a genuine bug that happens to
// touch a chrome.* API is never silently swallowed alongside it.
export function isContextInvalidatedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes("Extension context invalidated");
}

// No native "invalidated" event exists, so this polls at a low frequency. Fires the callback
// at most once. Returns an unsubscribe function so re-injection never leaves two watchers
// running against the same window.
export function watchForContextInvalidation(onInvalidated: () => void, intervalMs = 3000): () => void {
  let fired = false;
  const intervalId = setInterval(() => {
    if (fired) return;
    if (!isExtensionContextValid()) {
      fired = true;
      onInvalidated();
    }
  }, intervalMs);
  return () => clearInterval(intervalId);
}
