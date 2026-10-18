import { sendBackgroundRelayRequest, type PendingRelayRequest } from "./backgroundRelay";
import type { EvidencePayloadItem } from "./evidencePayload";
import type { AnalyzeSignalsApiResponse, SignalClassificationOutcome } from "./signalTypes";

export const LINKWISE_ANALYZE_SIGNALS = "LINKWISE_ANALYZE_SIGNALS";
export const LINKWISE_CANCEL_SIGNALS = "LINKWISE_CANCEL_SIGNALS";

// Contract version 2: only items still to be graded, plus short context for the rest.
export interface AnalyzeSignalsRequestBody {
  version: 2;
  profile: { identity: string; evidence: EvidencePayloadItem[]; context?: { section: string; text: string }[] };
  goal?: { text: string } | null;
}

export type PendingSignalRequest = PendingRelayRequest<SignalClassificationOutcome>;

function toOutcome(response: AnalyzeSignalsApiResponse): SignalClassificationOutcome {
  if (response.status === "signals") {
    if (response.version !== 2 || !Array.isArray(response.candidates) || !Array.isArray(response.classified)) return { status: "unavailable", reason: "processing_error" };
    return { status: "ok", careerStage: response.careerStage, candidates: response.candidates, classified: response.classified };
  }
  if (response.status === "unavailable") return { status: "unavailable", reason: response.reason };
  return { status: "unavailable", reason: response.status };
}

export function requestSignalAnalysis(payload: AnalyzeSignalsRequestBody): PendingSignalRequest {
  return sendBackgroundRelayRequest<AnalyzeSignalsApiResponse, SignalClassificationOutcome>({
    requestType: LINKWISE_ANALYZE_SIGNALS,
    cancelType: LINKWISE_CANCEL_SIGNALS,
    idPrefix: "signals_req",
    payload,
    toOutcome,
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
