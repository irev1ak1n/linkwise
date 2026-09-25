// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINKWISE_GENERATE_CRITERIA, LINKWISE_CANCEL_GENERATE_CRITERIA, requestGenerateCriteria } from "./generateCriteriaClient";
import type { GenerateCriteriaApiResponse } from "./apiTypes";

function installFakeChromeRuntime(respond: (message: unknown) => GenerateCriteriaApiResponse | undefined) {
  const sendMessage = vi.fn((message: unknown, callback?: (response: unknown) => void) => {
    const response = respond(message);
    if (callback) callback(response);
    return Promise.resolve(response);
  });
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { id: "test-extension-id", sendMessage, lastError: undefined } };
  return sendMessage;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("requestGenerateCriteria - success", () => {
  it("resolves to an 'ok' outcome from a generated response", async () => {
    installFakeChromeRuntime((message) => {
      expect((message as { type: string }).type).toBe(LINKWISE_GENERATE_CRITERIA);
      expect((message as { payload: { description: string } }).payload).toEqual({ description: "FRC mentor" });
      return {
        status: "generated",
        name: "FRC Mentors",
        criteria: [{ label: "FRC mentor", type: "role", importance: "MUST_HAVE", operator: null, value: null, groupId: null, sourceText: "FRC mentor" }],
      };
    });

    const { promise } = requestGenerateCriteria("FRC mentor");
    const outcome = await promise;
    expect(outcome).toMatchObject({ status: "ok", name: "FRC Mentors" });
    expect(outcome.status === "ok" && outcome.criteria).toHaveLength(1);
  });
});

describe("requestGenerateCriteria - graceful fallback", () => {
  it("resolves to 'unavailable' when the backend reports not_configured", async () => {
    installFakeChromeRuntime(() => ({ status: "not_configured" }));
    const { promise } = requestGenerateCriteria("FRC mentor");
    expect(await promise).toEqual({ status: "unavailable", reason: "not_configured" });
  });

  it("resolves to 'unavailable' when the backend reports it's temporarily unavailable", async () => {
    installFakeChromeRuntime(() => ({ status: "unavailable", reason: "timeout" }));
    const { promise } = requestGenerateCriteria("FRC mentor");
    expect(await promise).toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("resolves to 'unavailable' when there is no response at all (background missing/reloading)", async () => {
    installFakeChromeRuntime(() => undefined);
    const { promise } = requestGenerateCriteria("FRC mentor");
    expect(await promise).toEqual({ status: "unavailable", reason: "no_response" });
  });

  it("resolves to 'unavailable' (never rejects) when the extension context is invalidated", async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { id: "test-extension-id",
        get sendMessage(): never {
          throw new TypeError("Cannot read properties of undefined (reading 'sendMessage')");
        },
        lastError: undefined,
      },
    };
    const { promise } = requestGenerateCriteria("FRC mentor");
    await expect(promise).resolves.toEqual({ status: "unavailable", reason: "extension_context_invalidated" });
  });
});

describe("requestGenerateCriteria - cancellation", () => {
  it("sends a cancel message carrying the same request ID", () => {
    const sendMessage = installFakeChromeRuntime(() => ({ status: "not_configured" }));
    const pending = requestGenerateCriteria("FRC mentor");
    pending.cancel();
    expect(sendMessage).toHaveBeenCalledWith({ type: LINKWISE_CANCEL_GENERATE_CRITERIA, requestId: pending.requestId });
  });

  it("never throws even if the background is unreachable for the cancel message", () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { id: "test-extension-id", sendMessage: vi.fn(() => Promise.reject(new Error("no receiver"))), lastError: undefined },
    };
    const pending = requestGenerateCriteria("FRC mentor");
    expect(() => pending.cancel()).not.toThrow();
  });
});
