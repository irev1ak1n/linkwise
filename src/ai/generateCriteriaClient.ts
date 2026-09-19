// Sends the generate-criteria request through the background worker, same reasoning as
// analyzeProfileClient.ts. No cache or debounce needed, this is one explicit button click.
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
