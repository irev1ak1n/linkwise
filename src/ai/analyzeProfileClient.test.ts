// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINKWISE_ANALYZE_PROFILE, LINKWISE_CANCEL_ANALYSIS, requestAiAnalysis } from "./analyzeProfileClient";
import type { AnalyzeProfileRequestBody } from "./buildAnalyzeRequest";
import type { AnalyzeProfileApiResponse } from "./apiTypes";

function fakePayload(): AnalyzeProfileRequestBody {
  return {
    goal: { id: "g1", description: "Test", criteria: [{ id: "c1", label: "Python", importance: "MUST_HAVE" }] },
    profile: { identity: "Jordan Rivera", evidence: [] },
    localAnalysis: { score: null, confidence: 0, profileExtracted: true, criterionResults: [] },
  };
}

function installFakeChromeRuntime(respond: (message: unknown) => AnalyzeProfileApiResponse | undefined) {
  const sendMessage = vi.fn((message: unknown, callback?: (response: unknown) => void) => {
    const response = respond(message);
    if (callback) callback(response);
    return Promise.resolve(response);
  });
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { sendMessage, lastError: undefined } };
  return sendMessage;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("requestAiAnalysis - success", () => {
  it("resolves to an 'ok' outcome from an ai_analysis response", async () => {
    installFakeChromeRuntime((message) => {
      expect((message as { type: string }).type).toBe(LINKWISE_ANALYZE_PROFILE);
      return {
        status: "ai_analysis",
        model: "test-model",
        result: { scorePercent: 80, disqualified: false, reasons: [], missing: [], complete: true, profileExtracted: true, confidence: 1 },
        narrative: {
          strengths: [],
          gaps: [],
          experienceAssessment: "relevant",
          experienceAssessmentReason: "x",
          recommendationReason: "x",
          contactRecommendationReason: "x",
          saveRecommendationReason: "x",
        },
      };
    });

    const { promise } = requestAiAnalysis(fakePayload());
    const outcome = await promise;
    expect(outcome).toMatchObject({ status: "ok", model: "test-model" });
  });
});

describe("requestAiAnalysis - graceful fallback", () => {
  it("resolves to 'unavailable' when the backend reports not_configured", async () => {
    installFakeChromeRuntime(() => ({ status: "not_configured" }));
    const { promise } = requestAiAnalysis(fakePayload());
    expect(await promise).toEqual({ status: "unavailable", reason: "not_configured" });
  });

  it("resolves to 'unavailable' when the backend reports it's temporarily unavailable", async () => {
    installFakeChromeRuntime(() => ({ status: "unavailable", reason: "timeout" }));
    const { promise } = requestAiAnalysis(fakePayload());
    expect(await promise).toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("resolves to 'unavailable' when there is no response at all (background missing/reloading)", async () => {
    installFakeChromeRuntime(() => undefined);
    const { promise } = requestAiAnalysis(fakePayload());
    expect(await promise).toEqual({ status: "unavailable", reason: "no_response" });
  });

  it("resolves to 'unavailable' when chrome.runtime.lastError is set", async () => {
    const sendMessage = vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.(undefined);
    });
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage, lastError: { message: "Could not establish connection." } },
    };
    const { promise } = requestAiAnalysis(fakePayload());
    expect(await promise).toEqual({ status: "unavailable", reason: "no_response" });
  });

  it("resolves to 'unavailable' (never rejects) when the extension context is invalidated", async () => {
    // A LinkedIn tab left open across an extension reload keeps its OLD content script instance
    // alive (LinkedIn is an SPA — a plain profile navigation never re-injects it), and
    // chrome.runtime.sendMessage throws synchronously in that orphaned instance. This must
    // degrade gracefully like every other failure mode, not reject and get stuck.
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        get sendMessage(): never {
          throw new TypeError("Cannot read properties of undefined (reading 'sendMessage')");
        },
        lastError: undefined,
      },
    };
    const { promise } = requestAiAnalysis(fakePayload());
    await expect(promise).resolves.toEqual({ status: "unavailable", reason: "extension_context_invalidated" });
  });
});

describe("requestAiAnalysis - cancellation", () => {
  it("sends a cancel message carrying the same request ID", () => {
    const sendMessage = installFakeChromeRuntime(() => ({ status: "not_configured" }));
    const pending = requestAiAnalysis(fakePayload());
    pending.cancel();
    expect(sendMessage).toHaveBeenCalledWith({ type: LINKWISE_CANCEL_ANALYSIS, requestId: pending.requestId });
  });

  it("never throws even if the background is unreachable for the cancel message", () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(() => Promise.reject(new Error("no receiver"))),
        lastError: undefined,
      },
    };
    const pending = requestAiAnalysis(fakePayload());
    expect(() => pending.cancel()).not.toThrow();
  });

  it("never throws even if sendMessage itself throws synchronously (invalidated context)", () => {
    installFakeChromeRuntime(() => ({ status: "not_configured" }));
    const pending = requestAiAnalysis(fakePayload());
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: {
        get sendMessage(): never {
          throw new TypeError("Cannot read properties of undefined (reading 'sendMessage')");
        },
        lastError: undefined,
      },
    };
    expect(() => pending.cancel()).not.toThrow();
  });
});
