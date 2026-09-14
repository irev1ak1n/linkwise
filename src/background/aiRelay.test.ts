import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  installAiRelay,
  LINKWISE_ANALYZE_PROFILE,
  LINKWISE_CANCEL_ANALYSIS,
  LINKWISE_GENERATE_CRITERIA,
  LINKWISE_CANCEL_GENERATE_CRITERIA,
} from "./aiRelay";

type Listener = (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void;

function installFakeChromeRuntime(): { listener: Listener } {
  let captured: Listener | undefined;
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => {
          captured = listener;
        },
      },
    },
  };
  return {
    get listener() {
      if (!captured) throw new Error("listener was never registered");
      return captured;
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("installAiRelay - successful proxy", () => {
  it("fetches the backend and forwards its JSON response back via sendResponse", async () => {
    const fake = installFakeChromeRuntime();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: "ai_analysis", model: "m" }) });
    installAiRelay(fetchImpl as unknown as typeof fetch);

    const sendResponse = vi.fn();
    const keepChannelOpen = fake.listener({ type: LINKWISE_ANALYZE_PROFILE, requestId: "r1", payload: { hello: "world" } }, {}, sendResponse);
    expect(keepChannelOpen).toBe(true); // must keep the async channel open

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ status: "ai_analysis", model: "m" }));
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/analyze-profile"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ hello: "world" }) }),
    );
  });
});

describe("installAiRelay - backend unavailable", () => {
  it("reports unavailable when fetch itself rejects (backend offline)", async () => {
    const fake = installFakeChromeRuntime();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    installAiRelay(fetchImpl as unknown as typeof fetch);

    const sendResponse = vi.fn();
    fake.listener({ type: LINKWISE_ANALYZE_PROFILE, requestId: "r1", payload: {} }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ status: "unavailable", reason: "network_error" }));
  });

  it("reports unavailable with the http status when the backend returns a non-2xx response", async () => {
    const fake = installFakeChromeRuntime();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    installAiRelay(fetchImpl as unknown as typeof fetch);

    const sendResponse = vi.fn();
    fake.listener({ type: LINKWISE_ANALYZE_PROFILE, requestId: "r1", payload: {} }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ status: "unavailable", reason: "http_500" }));
  });
});

describe("installAiRelay - cancellation", () => {
  it("aborts the underlying fetch's signal when a cancel message arrives for the same request ID", async () => {
    const fake = installFakeChromeRuntime();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise(() => {}); // never resolves — only the abort should end this
    });
    installAiRelay(fetchImpl as unknown as typeof fetch);

    fake.listener({ type: LINKWISE_ANALYZE_PROFILE, requestId: "r1", payload: {} }, {}, vi.fn());
    expect(capturedSignal?.aborted).toBe(false);

    fake.listener({ type: LINKWISE_CANCEL_ANALYSIS, requestId: "r1" }, {}, vi.fn());
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("does nothing harmful when cancelling a request ID that isn't (or is no longer) in flight", () => {
    const fake = installFakeChromeRuntime();
    installAiRelay(vi.fn() as unknown as typeof fetch);
    expect(() => fake.listener({ type: LINKWISE_CANCEL_ANALYSIS, requestId: "does-not-exist" }, {}, vi.fn())).not.toThrow();
  });
});

describe("installAiRelay - generate-criteria proxy", () => {
  it("fetches the criteria-generation endpoint and forwards its JSON response back", async () => {
    const fake = installFakeChromeRuntime();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: "generated", name: "n", criteria: [] }) });
    installAiRelay(fetchImpl as unknown as typeof fetch);

    const sendResponse = vi.fn();
    const keepChannelOpen = fake.listener(
      { type: LINKWISE_GENERATE_CRITERIA, requestId: "r1", payload: { description: "FRC mentor" } },
      {},
      sendResponse,
    );
    expect(keepChannelOpen).toBe(true);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ status: "generated", name: "n", criteria: [] }));
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/generate-criteria"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ description: "FRC mentor" }) }),
    );
  });

  it("reports unavailable when the criteria-generation fetch rejects", async () => {
    const fake = installFakeChromeRuntime();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    installAiRelay(fetchImpl as unknown as typeof fetch);

    const sendResponse = vi.fn();
    fake.listener({ type: LINKWISE_GENERATE_CRITERIA, requestId: "r1", payload: {} }, {}, sendResponse);

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ status: "unavailable", reason: "network_error" }));
  });

  it("aborts the underlying fetch when a matching cancel-generate-criteria message arrives", () => {
    const fake = installFakeChromeRuntime();
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => {
      capturedSignal = init.signal as AbortSignal;
      return new Promise(() => {});
    });
    installAiRelay(fetchImpl as unknown as typeof fetch);

    fake.listener({ type: LINKWISE_GENERATE_CRITERIA, requestId: "r1", payload: {} }, {}, vi.fn());
    expect(capturedSignal?.aborted).toBe(false);

    fake.listener({ type: LINKWISE_CANCEL_GENERATE_CRITERIA, requestId: "r1" }, {}, vi.fn());
    expect(capturedSignal?.aborted).toBe(true);
  });
});

describe("installAiRelay - unrelated messages", () => {
  it("ignores a message of an unrelated type", () => {
    const fake = installFakeChromeRuntime();
    installAiRelay(vi.fn() as unknown as typeof fetch);
    const result = fake.listener({ type: "SOME_OTHER_MESSAGE" }, {}, vi.fn());
    expect(result).toBe(false);
  });
});
