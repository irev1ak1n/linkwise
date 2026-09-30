import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { SignalAnalysisClient } from "./openai/signalsClient";
import type { SignalAnalysisResponse } from "./openai/signalsSchema";

const body = {
  profile: {
    identity: "jordan-rivera",
    evidence: [
      { id: "experience:0", section: "experience", text: "Web Lead — Led a 4-person web team and reached 300+ visitors", evidenceType: "experience" },
      { id: "about:0", section: "about", text: "Passionate about technology.", evidenceType: "about" },
    ],
  },
};

function fakeClient(response: SignalAnalysisResponse, prompts: string[] = []): SignalAnalysisClient {
  return {
    analyze: async (_system, user) => {
      prompts.push(user);
      return response;
    },
  };
}

function appWith(client: SignalAnalysisClient, timeoutMs?: number) {
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), signalClient: client, timeoutMs });
}

describe("POST /api/analyze-signals", () => {
  it("responds not_configured without an API key", async () => {
    const res = await request(createApp({ config: loadConfig({}) })).post("/api/analyze-signals").send(body);
    expect(res.body).toEqual({ status: "not_configured" });
  });

  it("rejects a malformed request as 400", async () => {
    const res = await request(appWith(fakeClient({ facts: [], entries: [] }))).post("/api/analyze-signals").send({ profile: { identity: "x" } });
    expect(res.status).toBe(400);
  });

  it("sends only structured evidence text to the model", async () => {
    const prompts: string[] = [];
    await request(appWith(fakeClient({ facts: [], entries: [] }, prompts))).post("/api/analyze-signals").send(body);
    expect(prompts[0]).toContain('"id": "experience:0"');
    expect(prompts[0]).not.toContain("<");
  });

  it("returns only grounded highlights and facts, as separate lists", async () => {
    const client = fakeClient({
      facts: [
        { text: "Led a 4-person web team", kind: "leadership", importance: 0.9, support: [{ evidenceId: "experience:0", quote: "Led a 4-person web team" }] },
        { text: "Led a 40-person company", kind: "leadership", importance: 0.95, support: [{ evidenceId: "experience:0", quote: "Led a 4-person web team" }] },
      ],
      entries: [
        { evidenceId: "experience:0", highlights: [{ quote: "reached 300+ visitors", role: "primary" }, { quote: "Led a 40-person company", role: "primary" }] },
        { evidenceId: "missing:3", highlights: [{ quote: "Web Lead", role: "primary" }] },
      ],
    });
    const res = await request(appWith(client)).post("/api/analyze-signals").send(body);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("signals");
    expect(res.body.highlights).toEqual([
      { evidenceId: "experience:0", section: "experience", quote: "reached 300+ visitors", type: "primary", importance: 0.9, metrics: ["300+ visitors"] },
    ]);
    expect(res.body.facts).toEqual([{ text: "Led a 4-person web team", kind: "leadership", evidenceId: "experience:0", evidenceIds: ["experience:0"] }]);
  });

  it("responds unavailable on timeout", async () => {
    const client: SignalAnalysisClient = {
      analyze: (_s, _u, signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    };
    const res = await request(appWith(client, 20)).post("/api/analyze-signals").send(body);
    expect(res.body).toEqual({ status: "unavailable", reason: "timeout" });
  });

  it("responds unavailable on an OpenAI error", async () => {
    const client: SignalAnalysisClient = { analyze: async () => Promise.reject(new Error("boom")) };
    const res = await request(appWith(client)).post("/api/analyze-signals").send(body);
    expect(res.body).toEqual({ status: "unavailable", reason: "openai_error" });
  });
});
