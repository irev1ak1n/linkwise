// Backend endpoint contract tests — real HTTP requests against a real Express app (via
// supertest, no port bound), with a fake AnalysisClient injected so no OpenAI SDK or API key is
// ever involved.
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { AnalysisClient } from "./openai/client";
import type { AnalysisResponse } from "./openai/responseSchema";

function validBody() {
  return {
    goal: {
      id: "goal_1",
      description: "Looking for an FRC mentor",
      criteria: [{ id: "c1", label: "FRC mentor", importance: "MUST_HAVE", category: "role" }],
    },
    profile: {
      identity: "Jordan Rivera",
      headline: "Robotics enthusiast",
      evidence: [{ id: "experience:0", section: "experience", text: "Mentored a robotics team for 3 years.", evidenceType: "experience" }],
    },
    localAnalysis: {
      score: null,
      confidence: 0,
      profileExtracted: true,
      criterionResults: [{ criterionId: "c1", strength: "missing", evidenceIds: [] }],
    },
  };
}

function fakeAnalysisResponse(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    criterionAssessments: [{ criterionId: "c1", assessment: "strong", confidence: 0.9, evidenceIds: ["experience:0"], rationale: "Mentored a robotics team." }],
    summary: "This profile shows direct FRC mentoring experience.",
    strengths: [{ title: "Strong FRC mentor", explanation: "Mentored a robotics team for 3 years.", evidenceIds: ["experience:0"] }],
    gaps: [],
    experienceAssessment: "relevant",
    experienceAssessmentReason: "Direct FRC mentoring is real experience relevant to this goal.",
    recommendation: "strong_candidate",
    recommendationReason: "Direct mentoring experience found.",
    contactRecommendation: "recommended",
    contactRecommendationReason: "Direct mentoring experience makes this worth a message.",
    saveRecommendation: "save",
    saveRecommendationReason: "Strong match worth keeping.",
    evidenceConfidence: 0.9,
    ...overrides,
  };
}

describe("GET /api/health", () => {
  it("reports configuration status without ever exposing the API key", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-super-secret" }) });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ aiConfigured: true });
    expect(JSON.stringify(res.body)).not.toContain("sk-super-secret");
  });
});

describe("POST /api/analyze-profile - API key missing", () => {
  it("responds with not_configured rather than crashing", async () => {
    const app = createApp({ config: loadConfig({}) });
    const res = await request(app).post("/api/analyze-profile").send(validBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "not_configured" });
  });
});

describe("POST /api/analyze-profile - malformed request", () => {
  it("rejects a request with no criteria as 400, never 500", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }) });
    const body = validBody();
    body.goal.criteria = [];
    const res = await request(app).post("/api/analyze-profile").send(body);
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON as 400", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }) });
    const res = await request(app).post("/api/analyze-profile").set("Content-Type", "application/json").send("{not valid json");
    expect(res.status).toBe(400);
  });

  it("rejects a payload exceeding the body size cap", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }) });
    const body = validBody();
    body.profile.evidence[0]!.text = "x".repeat(2 * 1024 * 1024); // 2MB, over the 1mb cap
    const res = await request(app).post("/api/analyze-profile").send(body);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/analyze-profile - AI timeout", () => {
  it("responds with an unavailable status rather than hanging or crashing", async () => {
    const client: AnalysisClient = {
      analyze: (_s, _u, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), client, timeoutMs: 20 });
    const res = await request(app).post("/api/analyze-profile").send(validBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unavailable", reason: "timeout" });
  });
});

describe("POST /api/analyze-profile - AI backend unavailable / upstream error", () => {
  it("responds with an unavailable status when the AI client throws", async () => {
    const client: AnalysisClient = { analyze: () => Promise.reject(new Error("network error")) };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), client });
    const res = await request(app).post("/api/analyze-profile").send(validBody());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unavailable", reason: "openai_error" });
  });
});

describe("POST /api/analyze-profile - successful AI analysis", () => {
  it("returns a merged, guardrail-applied result plus validated narrative", async () => {
    const client: AnalysisClient = { analyze: () => Promise.resolve(fakeAnalysisResponse()) };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "test-model" }), client });
    const res = await request(app).post("/api/analyze-profile").send(validBody());

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ai_analysis");
    expect(res.body.model).toBe("test-model");
    expect(res.body.result.scorePercent).toBe(100);
    expect(res.body.result.reasons).toHaveLength(1);
    expect(res.body.narrative.strengths).toHaveLength(1);
    expect(res.body.narrative.summary).toContain("FRC mentoring");
  });

  it("never returns the API key anywhere in the response", async () => {
    const client: AnalysisClient = { analyze: () => Promise.resolve(fakeAnalysisResponse()) };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-super-secret-value" }), client });
    const res = await request(app).post("/api/analyze-profile").send(validBody());
    expect(JSON.stringify(res.body)).not.toContain("sk-super-secret-value");
  });

  it("strips an AI strength that cites an evidence ID never supplied in the request", async () => {
    const client: AnalysisClient = {
      analyze: () =>
        Promise.resolve(
          fakeAnalysisResponse({ strengths: [{ title: "Fabricated claim", explanation: "...", evidenceIds: ["experience:99"] }] }),
        ),
    };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), client });
    const res = await request(app).post("/api/analyze-profile").send(validBody());
    expect(res.body.narrative.strengths).toEqual([]);
  });

  it("processes gracefully even when the AI response is internally malformed relative to the request (unknown criterion id)", async () => {
    const client: AnalysisClient = {
      analyze: () =>
        Promise.resolve(
          fakeAnalysisResponse({
            criterionAssessments: [{ criterionId: "does-not-exist", assessment: "strong", confidence: 0.9, evidenceIds: [], rationale: "x" }],
          }),
        ),
    };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), client });
    const res = await request(app).post("/api/analyze-profile").send(validBody());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ai_analysis");
    // The real criterion "c1" was never addressed by that bogus assessment — falls back to local.
    expect(res.body.result.missing.some((m: { criterion: { id: string } }) => m.criterion.id === "c1")).toBe(true);
  });
});
