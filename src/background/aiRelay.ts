// The background worker's half of the content-script/backend bridge. Relays the actual HTTP
// request and supports cancelling it by ID, since messaging can't carry a real AbortSignal.
// Handles both the analysis and criteria-generation endpoints.
import { analyzeProfileEndpoint, analyzeSignalsEndpoint, generateCriteriaEndpoint, optimizeProfileEndpoint, optimizerDraftEndpoint, optimizerHeadlinesEndpoint, optimizerSectionEndpoint, compareProfileEndpoint } from "../ai/config";

export const LINKWISE_ANALYZE_PROFILE = "LINKWISE_ANALYZE_PROFILE";
export const LINKWISE_CANCEL_ANALYSIS = "LINKWISE_CANCEL_ANALYSIS";
export const LINKWISE_GENERATE_CRITERIA = "LINKWISE_GENERATE_CRITERIA";
export const LINKWISE_CANCEL_GENERATE_CRITERIA = "LINKWISE_CANCEL_GENERATE_CRITERIA";
export const LINKWISE_ANALYZE_SIGNALS = "LINKWISE_ANALYZE_SIGNALS";
export const LINKWISE_CANCEL_SIGNALS = "LINKWISE_CANCEL_SIGNALS";
export const LINKWISE_OPTIMIZE_PROFILE = "LINKWISE_OPTIMIZE_PROFILE";
export const LINKWISE_CANCEL_OPTIMIZE = "LINKWISE_CANCEL_OPTIMIZE";
export const LINKWISE_OPTIMIZER_DRAFT = "LINKWISE_OPTIMIZER_DRAFT";
export const LINKWISE_CANCEL_OPTIMIZER_DRAFT = "LINKWISE_CANCEL_OPTIMIZER_DRAFT";
export const LINKWISE_OPTIMIZER_SECTION = "LINKWISE_OPTIMIZER_SECTION";
export const LINKWISE_CANCEL_OPTIMIZER_SECTION = "LINKWISE_CANCEL_OPTIMIZER_SECTION";
export const LINKWISE_OPTIMIZER_HEADLINES = "LINKWISE_OPTIMIZER_HEADLINES";
export const LINKWISE_CANCEL_OPTIMIZER_HEADLINES = "LINKWISE_CANCEL_OPTIMIZER_HEADLINES";
export const LINKWISE_COMPARE_PROFILE = "LINKWISE_COMPARE_PROFILE";
export const LINKWISE_CANCEL_COMPARE_PROFILE = "LINKWISE_CANCEL_COMPARE_PROFILE";

const ENDPOINTS: Record<string, () => string> = {
  [LINKWISE_ANALYZE_PROFILE]: analyzeProfileEndpoint,
  [LINKWISE_GENERATE_CRITERIA]: generateCriteriaEndpoint,
  [LINKWISE_ANALYZE_SIGNALS]: analyzeSignalsEndpoint,
  [LINKWISE_OPTIMIZE_PROFILE]: optimizeProfileEndpoint,
  [LINKWISE_OPTIMIZER_DRAFT]: optimizerDraftEndpoint,
  [LINKWISE_OPTIMIZER_SECTION]: optimizerSectionEndpoint,
  [LINKWISE_OPTIMIZER_HEADLINES]: optimizerHeadlinesEndpoint,
  [LINKWISE_COMPARE_PROFILE]: compareProfileEndpoint,
};

const CANCEL_TYPES = new Set([
  LINKWISE_CANCEL_ANALYSIS,
  LINKWISE_CANCEL_GENERATE_CRITERIA,
  LINKWISE_CANCEL_SIGNALS,
  LINKWISE_CANCEL_OPTIMIZE,
  LINKWISE_CANCEL_OPTIMIZER_DRAFT,
  LINKWISE_CANCEL_OPTIMIZER_SECTION,
  LINKWISE_CANCEL_OPTIMIZER_HEADLINES,
  LINKWISE_CANCEL_COMPARE_PROFILE,
]);

interface RelayMessage {
  type: string;
  requestId: string;
  payload: unknown;
}

interface CancelMessage {
  type: string;
  requestId: string;
}

function messageType(message: unknown): unknown {
  return typeof message === "object" && message !== null ? (message as { type?: unknown }).type : undefined;
}

function isRelayMessage(message: unknown): message is RelayMessage {
  const type = messageType(message);
  return typeof type === "string" && Object.hasOwn(ENDPOINTS, type);
}

function isCancelMessage(message: unknown): message is CancelMessage {
  const type = messageType(message);
  return typeof type === "string" && CANCEL_TYPES.has(type);
}

function endpointFor(type: string): string {
  return ENDPOINTS[type]!();
}

const inFlight = new Map<string, AbortController>();

/** Registered once from background/index.ts. fetchImpl is injectable for tests only. */
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
