// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINKWISE_ANALYZE_SIGNALS, requestSignalAnalysis, type AnalyzeSignalsRequestBody } from "./signalsClient";
import type { AnalyzeSignalsApiResponse } from "./signalTypes";

function installFakeChromeRuntime(response: AnalyzeSignalsApiResponse | undefined, runtime: Record<string, unknown> = { id: "test-extension-id" }) {
  const sendMessage = vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
    callback?.(response);
    return Promise.resolve(response);
  });
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { ...runtime, sendMessage, lastError: undefined } };
  return sendMessage;
}

const payload: AnalyzeSignalsRequestBody = {
  version: 3,
  goal: null,
  profile: { identity: "jordan-rivera", evidence: [{ id: "about:0", section: "about", text: "Led a team", evidenceType: "about" }] },
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("requestSignalAnalysis", () => {
  it("resolves ok with graded candidates and the items that were graded", async () => {
    const sendMessage = installFakeChromeRuntime({ status: "signals", version: 3, model: "m", careerStage: "student", candidates: [], classified: ["about:0"] });
    const outcome = await requestSignalAnalysis(payload).promise;
    expect(outcome).toEqual({ status: "ok", careerStage: "student", candidates: [], classified: ["about:0"] });
    expect(sendMessage.mock.calls[0]![0]).toMatchObject({ type: LINKWISE_ANALYZE_SIGNALS, payload });
  });

  it("treats a response from an older contract as unavailable", async () => {
    installFakeChromeRuntime({ status: "signals", model: "m", highlights: [], facts: [] } as unknown as AnalyzeSignalsApiResponse);
    expect(await requestSignalAnalysis(payload).promise).toEqual({ status: "unavailable", reason: "processing_error" });
  });

  it("reports unavailable when OpenAI is not configured", async () => {
    installFakeChromeRuntime({ status: "not_configured" });
    expect(await requestSignalAnalysis(payload).promise).toEqual({ status: "unavailable", reason: "not_configured" });
  });

  it("reports unavailable when the backend fails", async () => {
    installFakeChromeRuntime({ status: "unavailable", reason: "openai_error" });
    expect(await requestSignalAnalysis(payload).promise).toEqual({ status: "unavailable", reason: "openai_error" });
  });

  it("reports unavailable when the background worker gives no response", async () => {
    installFakeChromeRuntime(undefined);
    expect(await requestSignalAnalysis(payload).promise).toEqual({ status: "unavailable", reason: "no_response" });
  });

  it("reports unavailable from an invalidated extension context", async () => {
    installFakeChromeRuntime(undefined, {});
    expect(await requestSignalAnalysis(payload).promise).toEqual({ status: "unavailable", reason: "extension_context_invalidated" });
  });
});
