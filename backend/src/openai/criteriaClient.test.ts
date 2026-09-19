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
  it("returns a timeout status when the client hangs past the deadline", async () => {
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
});

describe("requestCriteriaGeneration - upstream error", () => {
  it("returns an error status (never throwing) when the client rejects", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client: CriteriaGenerationClient = { generate: vi.fn().mockRejectedValue(new Error("rate limited")) };

    const result = await requestCriteriaGeneration(config, "system", "user", { client });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toBe("rate limited");
  });
});
