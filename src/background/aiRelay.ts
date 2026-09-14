// The background service worker's half of the content-script <-> backend bridge — the content
// script never fetches the backend directly (see ../ai/analyzeProfileClient.ts's doc comment
// for why); this relays the actual HTTP request from the one context with unambiguous
// cross-origin fetch permissions under Manifest V3, and supports cancelling an in-flight
// request by ID since chrome.runtime messaging can't carry a real AbortSignal across the
// content-script/background boundary. Handles both the profile-analysis and criteria-generation
// endpoints — same relay mechanics, different backend route.
import { analyzeProfileEndpoint, generateCriteriaEndpoint } from "../ai/config";

export const LINKWISE_ANALYZE_PROFILE = "LINKWISE_ANALYZE_PROFILE";
export const LINKWISE_CANCEL_ANALYSIS = "LINKWISE_CANCEL_ANALYSIS";
export const LINKWISE_GENERATE_CRITERIA = "LINKWISE_GENERATE_CRITERIA";
export const LINKWISE_CANCEL_GENERATE_CRITERIA = "LINKWISE_CANCEL_GENERATE_CRITERIA";

interface RelayMessage {
  type: typeof LINKWISE_ANALYZE_PROFILE | typeof LINKWISE_GENERATE_CRITERIA;
  requestId: string;
  payload: unknown;
}

interface CancelMessage {
  type: typeof LINKWISE_CANCEL_ANALYSIS | typeof LINKWISE_CANCEL_GENERATE_CRITERIA;
  requestId: string;
}

function messageType(message: unknown): unknown {
  return typeof message === "object" && message !== null ? (message as { type?: unknown }).type : undefined;
}

function isRelayMessage(message: unknown): message is RelayMessage {
  const type = messageType(message);
  return type === LINKWISE_ANALYZE_PROFILE || type === LINKWISE_GENERATE_CRITERIA;
}

function isCancelMessage(message: unknown): message is CancelMessage {
  const type = messageType(message);
  return type === LINKWISE_CANCEL_ANALYSIS || type === LINKWISE_CANCEL_GENERATE_CRITERIA;
}

function endpointFor(type: RelayMessage["type"]): string {
  return type === LINKWISE_ANALYZE_PROFILE ? analyzeProfileEndpoint() : generateCriteriaEndpoint();
}

const inFlight = new Map<string, AbortController>();

/** Registered once from background/index.ts. `fetchImpl` is injectable purely for tests — the
 * real caller always uses the global `fetch`. Returns nothing itself; the listener it installs
 * returns `true` for a relay message specifically, which is what tells Chrome to keep the
 * message channel open for an asynchronous `sendResponse` call (the fetch has not resolved yet
 * when the listener function itself returns). */
export function installAiRelay(fetchImpl: typeof fetch = fetch): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isRelayMessage(message)) {
      const controller = new AbortController();
      inFlight.set(message.requestId, controller);

      fetchImpl(endpointFor(message.type), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message.payload),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            sendResponse({ status: "unavailable", reason: `http_${response.status}` });
            return;
          }
          const data = await response.json();
          sendResponse(data);
        })
        .catch((error: unknown) => {
          const isAbort = error instanceof Error && error.name === "AbortError";
          sendResponse({ status: "unavailable", reason: isAbort ? "cancelled" : "network_error" });
        })
        .finally(() => {
          inFlight.delete(message.requestId);
        });

      return true; // keep the message channel open for the async sendResponse above
    }

    if (isCancelMessage(message)) {
      inFlight.get(message.requestId)?.abort();
      inFlight.delete(message.requestId);
      return false;
    }

    return false;
  });
}
