import { sendBackgroundRelayRequest, type PendingRelayRequest } from "../ai/backgroundRelay";
import type { EvidencePayloadItem } from "../ai/evidencePayload";
import type { SectionPresence } from "./sections";
import type {
  AboutOptionsApiResponse,
  AboutOptionsOutcome,
  DraftOutcome,
  DraftSection,
  HeadlineOptionsApiResponse,
  HeadlineOptionsOutcome,
  OptimizeProfileApiResponse,
  OptimizerDraftApiResponse,
  OptimizerOutcome,
  SectionAnalysisApiResponse,
  SectionAnalysisOutcome,
} from "./optimizerTypes";

export const LINKWISE_OPTIMIZE_PROFILE = "LINKWISE_OPTIMIZE_PROFILE";
export const LINKWISE_CANCEL_OPTIMIZE = "LINKWISE_CANCEL_OPTIMIZE";
export const LINKWISE_OPTIMIZER_DRAFT = "LINKWISE_OPTIMIZER_DRAFT";
export const LINKWISE_CANCEL_OPTIMIZER_DRAFT = "LINKWISE_CANCEL_OPTIMIZER_DRAFT";
export const LINKWISE_OPTIMIZER_SECTION = "LINKWISE_OPTIMIZER_SECTION";
export const LINKWISE_CANCEL_OPTIMIZER_SECTION = "LINKWISE_CANCEL_OPTIMIZER_SECTION";
export const LINKWISE_OPTIMIZER_HEADLINES = "LINKWISE_OPTIMIZER_HEADLINES";
export const LINKWISE_CANCEL_OPTIMIZER_HEADLINES = "LINKWISE_CANCEL_OPTIMIZER_HEADLINES";
export const LINKWISE_OPTIMIZER_ABOUTS = "LINKWISE_OPTIMIZER_ABOUTS";
export const LINKWISE_CANCEL_OPTIMIZER_ABOUTS = "LINKWISE_CANCEL_OPTIMIZER_ABOUTS";

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

export interface SectionAnalysisRequestBody {
  profile: OptimizerProfilePayload;
  section: "banner";
  present: boolean;
  userContext: string;
}

export interface HeadlineGenerationRequestBody {
  profile: OptimizerProfilePayload;
  currentHeadline: string;
  targetRole: string;
  keywords: string;
  additionalContext: string;
  language: string;
  userContext: string;
}

export interface AboutGenerationRequestBody {
  profile: OptimizerProfilePayload;
  currentAbout: string;
  targetRole: string;
  standOut: string;
  additionalContext: string;
  language: string;
  variation: number;
  userContext: string;
}

export function requestAboutOptions(payload: AboutGenerationRequestBody): PendingRelayRequest<AboutOptionsOutcome> {
  return sendBackgroundRelayRequest<AboutOptionsApiResponse, AboutOptionsOutcome>({
    requestType: LINKWISE_OPTIMIZER_ABOUTS,
    cancelType: LINKWISE_CANCEL_OPTIMIZER_ABOUTS,
    idPrefix: "abouts_req",
    payload,
    toOutcome: (response) => (response.status === "abouts" ? { status: "ok", options: response.options } : unavailable(response)),
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}

export function requestSectionAnalysis(payload: SectionAnalysisRequestBody): PendingRelayRequest<SectionAnalysisOutcome> {
  return sendBackgroundRelayRequest<SectionAnalysisApiResponse, SectionAnalysisOutcome>({
    requestType: LINKWISE_OPTIMIZER_SECTION,
    cancelType: LINKWISE_CANCEL_OPTIMIZER_SECTION,
    idPrefix: "section_req",
    payload,
    toOutcome: (response) =>
      response.status === "section"
        ? { status: "ok", analysis: { state: response.state, summary: response.summary, findings: response.findings, ideas: response.ideas } }
        : unavailable(response),
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}

export function requestHeadlineOptions(payload: HeadlineGenerationRequestBody): PendingRelayRequest<HeadlineOptionsOutcome> {
  return sendBackgroundRelayRequest<HeadlineOptionsApiResponse, HeadlineOptionsOutcome>({
    requestType: LINKWISE_OPTIMIZER_HEADLINES,
    cancelType: LINKWISE_CANCEL_OPTIMIZER_HEADLINES,
    idPrefix: "headlines_req",
    payload,
    toOutcome: (response) => (response.status === "headlines" ? { status: "ok", options: response.options } : unavailable(response)),
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
