// Sends the analyze-profile request via the background service worker — NEVER a direct fetch
// from the content script. This goes one step further than just "don't call OpenAI directly":
// it also never calls the LinkWise backend directly from the content script either, relaying
// through the background worker instead (see background/aiRelay.ts), since that's the context
// with unambiguous cross-origin fetch permissions under Manifest V3 — the same reasoning this
// project already applied to `chrome.runtime.reload()` earlier (a content script has a reduced
// API surface; the background worker has the full one). The actual message-passing mechanics
// (including graceful handling of an orphaned/invalidated extension context) live in
// backgroundRelay.ts, shared with generateCriteriaClient.ts.
import type { AnalyzeProfileRequestBody } from "./buildAnalyzeRequest";
import type { AiAnalysisOutcome, AnalyzeProfileApiResponse } from "./apiTypes";
import { sendBackgroundRelayRequest, type PendingRelayRequest } from "./backgroundRelay";

export const LINKWISE_ANALYZE_PROFILE = "LINKWISE_ANALYZE_PROFILE";
export const LINKWISE_CANCEL_ANALYSIS = "LINKWISE_CANCEL_ANALYSIS";

export type PendingAiRequest = PendingRelayRequest<AiAnalysisOutcome>;

function toOutcome(response: AnalyzeProfileApiResponse): AiAnalysisOutcome {
  if (response.status === "ai_analysis") {
    return { status: "ok", model: response.model, result: response.result, narrative: response.narrative };
  }
  if (response.status === "unavailable") {
    return { status: "unavailable", reason: response.reason };
  }
  return { status: "unavailable", reason: response.status };
}

export function requestAiAnalysis(payload: AnalyzeProfileRequestBody): PendingAiRequest {
  return sendBackgroundRelayRequest<AnalyzeProfileApiResponse, AiAnalysisOutcome>({
    requestType: LINKWISE_ANALYZE_PROFILE,
    cancelType: LINKWISE_CANCEL_ANALYSIS,
    idPrefix: "ai_req",
    payload,
    toOutcome,
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
