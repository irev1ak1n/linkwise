// Turns an AiAnalysisState "unavailable" reason code into a short, human-readable phrase, shown
// in the panel (see AnalysisView.tsx) so a real failure is diagnosable without opening the
// background service worker's own console. New/unrecognized reason codes fall back to a generic
// phrase rather than leaking a raw internal code to the user.
const REASON_LABELS: Record<string, string> = {
  not_configured: "the backend has no OpenAI API key configured",
  timeout: "the request timed out",
  openai_error: "the OpenAI request failed",
  processing_error: "the AI response could not be processed",
  invalid_request: "the request was rejected as invalid",
  network_error: "the backend couldn't be reached",
  no_response: "the extension's background service didn't respond",
  extension_context_invalidated: "the extension needs to be reloaded",
  cancelled: "the request was cancelled",
  unexpected_error: "an unexpected error occurred",
};

export function describeAiUnavailableReason(reason: string): string {
  const known = REASON_LABELS[reason];
  if (known) return known;
  const httpMatch = /^http_(\d+)$/.exec(reason);
  if (httpMatch) return `the backend returned an error (HTTP ${httpMatch[1]})`;
  return "an unknown error occurred";
}
