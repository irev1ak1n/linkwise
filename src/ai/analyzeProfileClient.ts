// Sends the analyze-profile request through the background worker, never a direct fetch from
// the content script (see background/aiRelay.ts). Message-passing mechanics live in
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
