// No real OpenAI SDK, API key, or network here. requestAnalysis is exercised through a fake
// AnalysisClient.
import { describe, expect, it, vi } from "vitest";
import { requestAnalysis, type AnalysisClient } from "./client";
import { loadConfig } from "../config";
import type { AnalysisResponse } from "./responseSchema";

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
  it("returns a timeout status when the client hangs past the deadline", async () => {
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
