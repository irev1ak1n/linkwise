import { describe, expect, it } from "vitest";
import { describeAiUnavailableReason } from "./aiUnavailableReason";

describe("describeAiUnavailableReason", () => {
  it("describes every known reason code with a human-readable phrase", () => {
    const knownReasons = [
      "not_configured",
      "timeout",
      "openai_error",
      "processing_error",
      "invalid_request",
      "network_error",
      "no_response",
      "extension_context_invalidated",
      "cancelled",
      "unexpected_error",
    ];
    for (const reason of knownReasons) {
      const description = describeAiUnavailableReason(reason);
      expect(description.length).toBeGreaterThan(0);
      expect(description).not.toBe(reason); // never just echoes the raw code
    }
  });

  it("describes an http_<status> reason with the actual status code", () => {
    expect(describeAiUnavailableReason("http_500")).toBe("the backend returned an error (HTTP 500)");
    expect(describeAiUnavailableReason("http_400")).toBe("the backend returned an error (HTTP 400)");
  });

  it("falls back to a generic phrase for an unrecognized reason code, never showing the raw code", () => {
    const description = describeAiUnavailableReason("some_future_reason_not_yet_known");
    expect(description).toBe("an unknown error occurred");
  });
});
