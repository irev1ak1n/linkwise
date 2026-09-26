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
    const res = await request(appWith(fakeClient({ signals: [] }))).post("/api/analyze-signals").send({ profile: { identity: "x" } });
    expect(res.status).toBe(400);
  });

  it("sends only structured evidence text to the model", async () => {
    const prompts: string[] = [];
    await request(appWith(fakeClient({ signals: [] }, prompts))).post("/api/analyze-signals").send(body);
    expect(prompts[0]).toContain('"id": "experience:0"');
    expect(prompts[0]).not.toContain("<");
  });

  it("returns only grounded signals and facts", async () => {
    const client = fakeClient({
      signals: [
        {
          evidenceId: "experience:0",
          quote: "Led a 4-person web team",
          type: "leadership",
          strength: "strong",
          importance: 0.9,
          facts: [{ text: "Led 4-person web team", metric: "4-person" }],
        },
        { evidenceId: "experience:0", quote: "Led a 40-person company", type: "leadership", strength: "strong", importance: 0.95, facts: [] },
        { evidenceId: "missing:3", quote: "Web Lead", type: "role", strength: "strong", importance: 0.8, facts: [] },
      ],
    });
    const res = await request(appWith(client)).post("/api/analyze-signals").send(body);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("signals");
    expect(res.body.signals).toEqual([
      {
        evidenceId: "experience:0",
        section: "experience",
        quote: "Led a 4-person web team",
        type: "leadership",
        strength: "strong",
        importance: 0.9,
        metrics: ["4-person"],
      },
    ]);
    expect(res.body.facts).toEqual([{ text: "Led 4-person web team", evidenceId: "experience:0" }]);
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
