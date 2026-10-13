import { sendBackgroundRelayRequest, type PendingRelayRequest } from "../ai/backgroundRelay";
import type { EvidencePayloadItem } from "../ai/evidencePayload";
import type { SectionPresence } from "./sections";
import type { DraftOutcome, DraftSection, OptimizeProfileApiResponse, OptimizerDraftApiResponse, OptimizerOutcome } from "./optimizerTypes";

export const LINKWISE_OPTIMIZE_PROFILE = "LINKWISE_OPTIMIZE_PROFILE";
export const LINKWISE_CANCEL_OPTIMIZE = "LINKWISE_CANCEL_OPTIMIZE";
export const LINKWISE_OPTIMIZER_DRAFT = "LINKWISE_OPTIMIZER_DRAFT";
export const LINKWISE_CANCEL_OPTIMIZER_DRAFT = "LINKWISE_CANCEL_OPTIMIZER_DRAFT";

export interface OptimizerProfilePayload {
  identity: string;
  evidence: EvidencePayloadItem[];
}

export interface OptimizeProfileRequestBody {
  profile: OptimizerProfilePayload;
  sections: SectionPresence[];
  userContext: string;
}

export interface OptimizerDraftRequestBody {
  profile: OptimizerProfilePayload;
  section: DraftSection;
  evidenceId: string | null;
  guidance: string;
  userContext: string;
}

function unavailable(response: { status: string; reason?: string }): { status: "unavailable"; reason: string } {
  return { status: "unavailable", reason: response.status === "unavailable" && response.reason ? response.reason : response.status };
}

export function requestProfileOptimization(payload: OptimizeProfileRequestBody): PendingRelayRequest<OptimizerOutcome> {
  return sendBackgroundRelayRequest<OptimizeProfileApiResponse, OptimizerOutcome>({
    requestType: LINKWISE_OPTIMIZE_PROFILE,
    cancelType: LINKWISE_CANCEL_OPTIMIZE,
    idPrefix: "optimize_req",
    payload,
    toOutcome: (response) => (response.status === "optimizer" ? { status: "ok", result: { summary: response.summary, sections: response.sections } } : unavailable(response)),
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}

export function requestOptimizerDraft(payload: OptimizerDraftRequestBody): PendingRelayRequest<DraftOutcome> {
  return sendBackgroundRelayRequest<OptimizerDraftApiResponse, DraftOutcome>({
    requestType: LINKWISE_OPTIMIZER_DRAFT,
    cancelType: LINKWISE_CANCEL_OPTIMIZER_DRAFT,
    idPrefix: "draft_req",
    payload,
    toOutcome: (response) => (response.status === "draft" ? { status: "ok", draft: response.draft } : unavailable(response)),
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
