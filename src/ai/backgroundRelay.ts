// Shared plumbing behind every "send this to the background service worker, get a typed outcome
// back" client (see analyzeProfileClient.ts and generateCriteriaClient.ts) — NEVER a direct
// fetch from the content script (see those files' own doc comments for why). Factored out once
// two call sites needed the identical mechanics, including the extension-context-invalidation
// handling: a LinkedIn tab left open across an extension reload keeps running its OLD content
// script instance (LinkedIn is a client-routed SPA, so a profile-to-profile navigation never
// re-injects it) — `chrome.runtime` goes undefined (or any call on it throws) in that orphaned
// instance the moment the old extension context is invalidated. That must resolve to the same
// graceful "unavailable" outcome as every other failure mode rather than throwing — a throw here
// would reject the promise, and an uncaught rejection would leave the caller's UI stuck on a
// loading state forever instead of falling back to local behavior.
let requestCounter = 0;
function nextRequestId(prefix: string): string {
  requestCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${requestCounter}`;
}

export interface PendingRelayRequest<TOutcome> {
  requestId: string;
  promise: Promise<TOutcome>;
  /** Tells the background worker to abort the underlying fetch, if it's still running.
   * chrome.runtime messaging can't carry a real AbortSignal across the process boundary, so
   * cancellation is its own explicit message rather than a shared signal object. */
  cancel: () => void;
}

export interface RelayRequestOptions<TResponse, TOutcome> {
  requestType: string;
  cancelType: string;
  /** Distinguishes one client's request IDs from another's in logs/debugging — purely cosmetic. */
  idPrefix: string;
  payload: unknown;
  toOutcome: (response: TResponse) => TOutcome;
  unavailable: (reason: string) => TOutcome;
}

export function sendBackgroundRelayRequest<TResponse, TOutcome>(
  options: RelayRequestOptions<TResponse, TOutcome>,
): PendingRelayRequest<TOutcome> {
  const requestId = nextRequestId(options.idPrefix);

  const promise = new Promise<TOutcome>((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: options.requestType, requestId, payload: options.payload }, (response: TResponse | undefined) => {
        if (chrome.runtime.lastError || !response) {
          resolve(options.unavailable("no_response"));
          return;
        }
        resolve(options.toOutcome(response));
      });
    } catch {
      resolve(options.unavailable("extension_context_invalidated"));
    }
  });

  function cancel(): void {
    try {
      chrome.runtime.sendMessage({ type: options.cancelType, requestId }).catch(() => {
        // Background may already be gone/reloading — nothing useful to do about a lost cancel.
      });
    } catch {
      // Same orphaned-context case as above — there's no receiver left to cancel anyway.
    }
  }

  return { requestId, promise, cancel };
}
