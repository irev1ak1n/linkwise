// Sends the generate-criteria request via the background service worker — never a direct fetch
// from the content script (see analyzeProfileClient.ts's doc comment; the same reasoning
// applies here). No cache/dedup/debounce layer like the profile-analysis path needs: this is a
// single explicit "Create criteria" button click, not a passive per-render trigger.
import type { GenerateCriteriaApiResponse, GenerateCriteriaOutcome } from "./apiTypes";
import { sendBackgroundRelayRequest, type PendingRelayRequest } from "./backgroundRelay";

export const LINKWISE_GENERATE_CRITERIA = "LINKWISE_GENERATE_CRITERIA";
export const LINKWISE_CANCEL_GENERATE_CRITERIA = "LINKWISE_CANCEL_GENERATE_CRITERIA";

export type PendingGenerateCriteriaRequest = PendingRelayRequest<GenerateCriteriaOutcome>;

function toOutcome(response: GenerateCriteriaApiResponse): GenerateCriteriaOutcome {
  if (response.status === "generated") {
    return { status: "ok", name: response.name, criteria: response.criteria };
  }
  if (response.status === "unavailable") {
    return { status: "unavailable", reason: response.reason };
  }
  return { status: "unavailable", reason: response.status };
}

export function requestGenerateCriteria(description: string): PendingGenerateCriteriaRequest {
  return sendBackgroundRelayRequest<GenerateCriteriaApiResponse, GenerateCriteriaOutcome>({
    requestType: LINKWISE_GENERATE_CRITERIA,
    cancelType: LINKWISE_CANCEL_GENERATE_CRITERIA,
    idPrefix: "criteria_req",
    payload: { description },
    toOutcome,
    unavailable: (reason) => ({ status: "unavailable", reason }),
  });
}
