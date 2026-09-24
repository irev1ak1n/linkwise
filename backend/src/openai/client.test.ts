// requestAnalysis itself is exercised through a fake AnalysisClient (no real SDK/key/network).
// createOpenAiAnalysisClient is the one function that touches the real "openai" package
// directly, so its own tests mock that package instead (vi.mock calls are hoisted above these
// imports by Vitest automatically) — this is the only place a malformed or refused
// structured-output response (no output_parsed) can actually be exercised, since every other
// test here bypasses this function entirely via the injected fake client.
import { describe, expect, it, vi } from "vitest";
import { createOpenAiAnalysisClient, requestAnalysis, type AnalysisClient } from "./client";
import { loadConfig } from "../config";
import type { AnalysisResponse } from "./responseSchema";

const { parseMock } = vi.hoisted(() => ({ parseMock: vi.fn() }));
vi.mock("openai", () => ({
  default: class FakeOpenAi {
    responses = { parse: parseMock };
  },
}));
vi.mock("openai/helpers/zod", () => ({
  zodTextFormat: vi.fn(() => ({ type: "json_schema" })),
}));

function fakeAnalysisResponse(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    matchPercent: 50,
    confidenceLevel: "medium",
    criterionAssessments: [],
    summary: "A profile summary.",
    strengths: [],
    gaps: [],
    experienceAssessment: "relevant",
    experienceAssessmentReason: "Reasonable relevant experience.",
    recommendation: "worth_contacting",
    recommendationReason: "Reasonable match.",
    contactRecommendation: "maybe",
    contactRecommendationReason: "Worth a message.",
    saveRecommendation: "consider_saving",
    saveRecommendationReason: "Keep for reference.",
    ...overrides,
  };
}

describe("createOpenAiAnalysisClient", () => {
  it("throws a clear error when OpenAI's response has no output_parsed (malformed/refused structured output)", async () => {
    parseMock.mockResolvedValueOnce({ output_parsed: null });
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client = createOpenAiAnalysisClient(config);

    await expect(client.analyze("system", "user", new AbortController().signal)).rejects.toThrow(
      "OpenAI response could not be parsed into the expected structured format.",
    );
  });

  it("that same malformed-response error surfaces through requestAnalysis as a real 'error' status, never a throw", async () => {
    parseMock.mockResolvedValueOnce({ output_parsed: undefined });
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });

    const result = await requestAnalysis(config, "system", "user");

    expect(result).toEqual({
      status: "error",
      message: "OpenAI response could not be parsed into the expected structured format.",
    });
  });

  it("returns the parsed structured response when output_parsed is present", async () => {
    const response = fakeAnalysisResponse();
    parseMock.mockResolvedValueOnce({ output_parsed: response });
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client = createOpenAiAnalysisClient(config);

    const result = await client.analyze("system", "user", new AbortController().signal);

    expect(result).toEqual(response);
  });

  it("calls responses.parse with the configured model and the given prompts", async () => {
    parseMock.mockResolvedValueOnce({ output_parsed: fakeAnalysisResponse() });
    const config = loadConfig({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-test-model" });
    const client = createOpenAiAnalysisClient(config);

    await client.analyze("sys prompt", "user prompt", new AbortController().signal);

    expect(parseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test-model",
        input: [
          { role: "system", content: "sys prompt" },
          { role: "user", content: "user prompt" },
        ],
      }),
      expect.anything(),
    );
  });

  it("throws if called without a configured API key, rather than silently constructing an unauthenticated client", () => {
    const config = loadConfig({});
    expect(() => createOpenAiAnalysisClient(config)).toThrow();
  });
});

describe("requestAnalysis - API key missing", () => {
  it("returns not_configured without ever constructing a real client", async () => {
    const config = loadConfig({});
    const result = await requestAnalysis(config, "system", "user");
    expect(result).toEqual({ status: "not_configured" });
  });
});

describe("requestAnalysis - success", () => {
  it("returns the parsed structured response from the injected client", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const response = fakeAnalysisResponse();
    const client: AnalysisClient = { analyze: vi.fn().mockResolvedValue(response) };

    const result = await requestAnalysis(config, "system", "user", { client });
    expect(result).toEqual({ status: "ok", data: response });
  });
});

describe("requestAnalysis - timeout", () => {
  it("returns a timeout status once every retry has also timed out", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client: AnalysisClient = {
      analyze: (_system, _user, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    };

    const result = await requestAnalysis(config, "system", "user", { client, timeoutMs: 20 });
    expect(result).toEqual({ status: "timeout" });
  });

  it("retries once after a timeout, and returns the result if the retry succeeds", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const response = fakeAnalysisResponse();
    let attempt = 0;
    const client: AnalysisClient = {
      analyze: (_system, _user, signal) => {
        attempt += 1;
        if (attempt === 1) {
          return new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          });
        }
        return Promise.resolve(response);
      },
    };

    const result = await requestAnalysis(config, "system", "user", { client, timeoutMs: 20 });
    expect(result).toEqual({ status: "ok", data: response });
    expect(attempt).toBe(2);
  });

  it("does not retry a real (non-timeout) error, since it would just fail the same way again", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const analyze = vi.fn().mockRejectedValue(new Error("rate limited"));
    const client: AnalysisClient = { analyze };

    const result = await requestAnalysis(config, "system", "user", { client });
    expect(result.status).toBe("error");
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});

describe("requestAnalysis - upstream error", () => {
  it("returns an error status (never throwing) when the client rejects", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client: AnalysisClient = { analyze: vi.fn().mockRejectedValue(new Error("rate limited")) };

    const result = await requestAnalysis(config, "system", "user", { client });
    expect(result.status).toBe("error");
    expect(result.status === "error" && result.message).toBe("rate limited");
  });

  it("never lets a thrown error escape as an unhandled rejection", async () => {
    const config = loadConfig({ OPENAI_API_KEY: "sk-test" });
    const client: AnalysisClient = { analyze: vi.fn().mockRejectedValue("a non-Error rejection") };
    await expect(requestAnalysis(config, "system", "user", { client })).resolves.toMatchObject({ status: "error" });
  });
});
