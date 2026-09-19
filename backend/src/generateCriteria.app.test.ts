// Backend endpoint contract tests for POST /api/generate-criteria, with a fake
// CriteriaGenerationClient so no OpenAI SDK or API key is involved. Kept as its own file so
// each endpoint's tests stay easy to find.
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { CriteriaGenerationClient } from "./openai/criteriaClient";
import type { GenerateCriteriaResponse } from "./openai/criteriaSchema";

function fakeGeneratedResponse(overrides: Partial<GenerateCriteriaResponse> = {}): GenerateCriteriaResponse {
  return {
    name: "TSA Members",
    criteria: [
      { label: "Current Technology Student Association member", type: "membership", importance: "PREFERRED", operator: null, value: null, groupId: null, sourceText: "Technology Student Association Current member" },
      { label: "Multilingual", type: "language", importance: "PREFERRED", operator: null, value: null, groupId: null, sourceText: "multilingual" },
      { label: "10+ service hours", type: "service", importance: "PREFERRED", operator: "at_least", value: "10", groupId: null, sourceText: "10+ service hours" },
    ],
    ...overrides,
  };
}

describe("POST /api/generate-criteria - API key missing", () => {
  it("responds with not_configured rather than crashing", async () => {
    const app = createApp({ config: loadConfig({}) });
    const res = await request(app).post("/api/generate-criteria").send({ description: "FRC mentor" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "not_configured" });
  });
});

describe("POST /api/generate-criteria - malformed request", () => {
  it("rejects a request with no description as 400, never 500", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }) });
    const res = await request(app).post("/api/generate-criteria").send({});
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON as 400", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }) });
    const res = await request(app).post("/api/generate-criteria").set("Content-Type", "application/json").send("{not valid json");
    expect(res.status).toBe(400);
  });

  it("rejects a description over the max length", async () => {
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }) });
    const res = await request(app).post("/api/generate-criteria").send({ description: "x".repeat(2000) });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate-criteria - AI timeout", () => {
  it("responds with an unavailable status rather than hanging or crashing", async () => {
    const client: CriteriaGenerationClient = {
      generate: (_s, _u, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), criteriaClient: client, timeoutMs: 20 });
    const res = await request(app).post("/api/generate-criteria").send({ description: "FRC mentor" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unavailable", reason: "timeout" });
  });
});

describe("POST /api/generate-criteria - AI backend unavailable / upstream error", () => {
  it("responds with an unavailable status when the AI client throws", async () => {
    const client: CriteriaGenerationClient = { generate: () => Promise.reject(new Error("network error")) };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), criteriaClient: client });
    const res = await request(app).post("/api/generate-criteria").send({ description: "FRC mentor" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unavailable", reason: "openai_error" });
  });
});

describe("POST /api/generate-criteria - successful generation", () => {
  it("returns sanitized, structured criteria", async () => {
    const client: CriteriaGenerationClient = { generate: () => Promise.resolve(fakeGeneratedResponse()) };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), criteriaClient: client });
    const res = await request(app)
      .post("/api/generate-criteria")
      .send({ description: "Technology Student Association Current member, multilingual, someone who has done 10+ service hours" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("generated");
    expect(res.body.name).toBe("TSA Members");
    expect(res.body.criteria).toHaveLength(3);
    expect(res.body.criteria[0].label).toBe("Current Technology Student Association member");
    expect(res.body.criteria[2]).toMatchObject({ label: "10+ service hours", operator: "at_least", value: "10" });
  });

  it("never returns the API key anywhere in the response", async () => {
    const client: CriteriaGenerationClient = { generate: () => Promise.resolve(fakeGeneratedResponse()) };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-super-secret-value" }), criteriaClient: client });
    const res = await request(app).post("/api/generate-criteria").send({ description: "FRC mentor" });
    expect(JSON.stringify(res.body)).not.toContain("sk-super-secret-value");
  });

  it("drops a degenerate empty-label criterion rather than passing it through", async () => {
    const client: CriteriaGenerationClient = {
      generate: () =>
        Promise.resolve(
          fakeGeneratedResponse({
            criteria: [{ label: "   ", type: "other", importance: "PREFERRED", operator: null, value: null, groupId: null, sourceText: "" }],
          }),
        ),
    };
    const app = createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), criteriaClient: client });
    const res = await request(app).post("/api/generate-criteria").send({ description: "vague" });
    expect(res.body.criteria).toEqual([]);
  });
});
