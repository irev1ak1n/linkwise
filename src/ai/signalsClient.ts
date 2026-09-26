import { sendBackgroundRelayRequest, type PendingRelayRequest } from "./backgroundRelay";
import type { EvidencePayloadItem } from "./evidencePayload";
import type { AnalyzeSignalsApiResponse, SignalAnalysisOutcome } from "./signalTypes";

export const LINKWISE_ANALYZE_SIGNALS = "LINKWISE_ANALYZE_SIGNALS";
export const LINKWISE_CANCEL_SIGNALS = "LINKWISE_CANCEL_SIGNALS";

export interface AnalyzeSignalsRequestBody {
  profile: { identity: string; evidence: EvidencePayloadItem[] };
}

export type PendingSignalRequest = PendingRelayRequest<SignalAnalysisOutcome>;

function toOutcome(response: AnalyzeSignalsApiResponse): SignalAnalysisOutcome {
  if (response.status === "signals") return { status: "ok", signals: response.signals, facts: response.facts };
  if (response.status === "unavailable") return { status: "unavailable", reason: response.reason };
  return { status: "unavailable", reason: response.status };
}

export function requestSignalAnalysis(payload: AnalyzeSignalsRequestBody): PendingSignalRequest {
  return sendBackgroundRelayRequest<AnalyzeSignalsApiResponse, SignalAnalysisOutcome>({
    requestType: LINKWISE_ANALYZE_SIGNALS,
    cancelType: LINKWISE_CANCEL_SIGNALS,
    idPrefix: "signals_req",
    payload,
    toOutcome,
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
