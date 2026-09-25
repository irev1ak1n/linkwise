// Shared plumbing for sending a message to the background worker and getting a typed outcome
// back (see analyzeProfileClient.ts and generateCriteriaClient.ts). Also handles an orphaned
// extension context gracefully: an old tab left open across a reload can have chrome.runtime
// go undefined, which should resolve to "unavailable" instead of throwing.
import { isExtensionContextValid } from "../linkedin/extensionContext";

let requestCounter = 0;
function nextRequestId(prefix: string): string {
  requestCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${requestCounter}`;
}

export interface PendingRelayRequest<TOutcome> {
  requestId: string;
  promise: Promise<TOutcome>;
  /** Tells the background worker to abort the fetch, since chrome.runtime messaging can't
   * carry a real AbortSignal across the process boundary. */
  cancel: () => void;
}

export interface RelayRequestOptions<TResponse, TOutcome> {
  requestType: string;
  cancelType: string;
  /** Just for telling request IDs apart in logs. */
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
    if (!isExtensionContextValid()) {
      resolve(options.unavailable("extension_context_invalidated"));
      return;
    }
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
    if (!isExtensionContextValid()) return; // no receiver left to cancel
    try {
      chrome.runtime.sendMessage({ type: options.cancelType, requestId }).catch(() => {
        // Background may already be gone. Nothing to do about a lost cancel.
      });
    } catch {
      // Same orphaned context as above, no receiver left to cancel.
    }
  }

  return { requestId, promise, cancel };
}
