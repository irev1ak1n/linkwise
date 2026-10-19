import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { SignalAnalysisClient } from "./openai/signalsClient";
import type { EvidenceFact, SignalClassification } from "./openai/signalsSchema";

const body = {
  version: 3,
  goal: { text: "Web developers" },
  profile: {
    identity: "jordan-rivera",
    evidence: [
      { id: "experience:0", section: "experience", text: "Web Lead — Led a 4-person web team and reached 300+ visitors", evidenceType: "experience" },
      { id: "about:0", section: "about", text: "Passionate about technology.", evidenceType: "about" },
    ],
    context: [{ section: "education", text: "Northfield High — AP Computer Science" }],
  },
};

const empty: SignalClassification = { careerStage: "student", items: [] };

function grade(quote: string, overrides: Partial<EvidenceFact> = {}): EvidenceFact {
  return {
    quote, fact: quote, type: "measurable_impact", claim: "main", group: 0, labels: ["impact"], impact: 2, ownership: 1, result: 2, scale: 2, selectivity: 0, leadership: 0,
    technicalDepth: 0, sustainedDepth: 0, specificity: 2, distinctiveness: 1, goalRelevance: 1, genericness: 0, confidence: 0.9, ...overrides,
  };
}

function fakeClient(response: SignalClassification, prompts: string[] = []): SignalAnalysisClient {
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
    const res = await request(appWith(fakeClient(empty))).post("/api/analyze-signals").send({ profile: { identity: "x" } });
    expect(res.status).toBe(400);
  });

  it("rejects the old unversioned contract", async () => {
    const { version: _version, ...old } = body;
    const res = await request(appWith(fakeClient(empty))).post("/api/analyze-signals").send(old);
    expect(res.status).toBe(400);
  });

  it("sends only structured evidence, context, and the goal to the model", async () => {
    const prompts: string[] = [];
    await request(appWith(fakeClient(empty, prompts))).post("/api/analyze-signals").send(body);
    const sent = JSON.parse(prompts[0]!);
    expect(sent.goal).toBe("Web developers");
    expect(sent.classify.map((item: { id: string }) => item.id)).toEqual(["experience:0", "about:0"]);
    expect(sent.context).toEqual([{ section: "education", text: "Northfield High — AP Computer Science" }]);
    expect(prompts[0]).not.toContain("<");
  });

  it("returns only grounded graded facts, and which items were graded", async () => {
    const client = fakeClient({
      careerStage: "student",
      items: [
        { evidenceId: "experience:0", facts: [grade("reached 300+ visitors"), grade("reached 3,000 visitors")] },
        { evidenceId: "missing:3", facts: [grade("Web Lead")] },
      ],
    });
    const res = await request(appWith(client)).post("/api/analyze-signals").send(body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "signals", version: 3, careerStage: "student", classified: ["experience:0", "about:0"] });
    expect(res.body.candidates).toHaveLength(1);
    expect(res.body.candidates[0]).toMatchObject({ evidenceId: "experience:0", quote: "reached 300+ visitors", metrics: ["300+ visitors"], goalRelevance: 1 });
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
