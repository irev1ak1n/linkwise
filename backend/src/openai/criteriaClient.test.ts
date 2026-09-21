// No real OpenAI SDK, API key, or network here. requestCriteriaGeneration is exercised
// through a fake CriteriaGenerationClient.
import { describe, expect, it, vi } from "vitest";
import { requestCriteriaGeneration, type CriteriaGenerationClient } from "./criteriaClient";
import { loadConfig } from "../config";
import type { GenerateCriteriaResponse } from "./criteriaSchema";

function fakeResponse(overrides: Partial<GenerateCriteriaResponse> = {}): GenerateCriteriaResponse {
  return {
    name: "FRC Mentors",
    criteria: [],
    ...overrides,
  };
}

describe("requestCriteriaGeneration - API key missing", () => {
  it("returns not_configured without ever constructing a real client", async () => {
    const config = loadConfig({});
    const result = await requestCriteriaGeneration(config, "system", "user");
    expect(result).toEqual({ status: "not_configured" });
  });
});

describe("requestCriteriaGeneration - success", () => {
  it("returns the parsed structured response from the injected client", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const response = fakeResponse();
    const client: CriteriaGenerationClient = { generate: vi.fn().mockResolvedValue(response) };

    const result = await requestCriteriaGeneration(config, "system", "user", { client });
    expect(result).toEqual({ status: "ok", data: response });
  });
});

describe("requestCriteriaGeneration - timeout", () => {
  it("returns a timeout status once every retry has also timed out", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client: CriteriaGenerationClient = {
      generate: (_system, _user, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    };

    const result = await requestCriteriaGeneration(config, "system", "user", { client, timeoutMs: 20 });
    expect(result).toEqual({ status: "timeout" });
  });

  it("retries once after a timeout, and returns the result if the retry succeeds", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const response = fakeResponse();
    let attempt = 0;
    const client: CriteriaGenerationClient = {
      generate: (_system, _user, signal) => {
        attempt += 1;
        if (attempt === 1) {
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          });
        }
        return Promise.resolve(response);
      },
    };

    const result = await requestCriteriaGeneration(config, "system", "user", { client, timeoutMs: 20 });
    expect(result).toEqual({ status: "ok", data: response });
    expect(attempt).toBe(2);
  });
});

describe("requestCriteriaGeneration - upstream error", () => {
  it("returns an error status (never throwing) when the client rejects", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client: CriteriaGenerationClient = { generate: vi.fn().mockRejectedValue(new Error("rate limited")) };

    const result = await requestCriteriaGeneration(config, "system", "user", { client });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toBe("rate limited");
  });

  it("does not retry a real (non-timeout) error, since it would just fail the same way again", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const generate = vi.fn().mockRejectedValue(new Error("rate limited"));
    const client: CriteriaGenerationClient = { generate };

    await requestCriteriaGeneration(config, "system", "user", { client });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
