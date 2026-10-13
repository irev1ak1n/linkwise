import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { StructuredClient } from "./openai/structuredClient";

const profile = {
  identity: "me",
  evidence: [
    { id: "headline:0", section: "headline", text: "Student at Westfield High", evidenceType: "headline" },
    { id: "education:0", section: "education", text: "Code Academy — Python, C++", evidenceType: "education" },
  ],
};

function fakeClient(response: unknown, prompts: string[] = []): StructuredClient {
  return {
    complete: async (_system, user) => {
      prompts.push(user);
      return response;
    },
  };
}

function appWith(clients: { sectionClient?: StructuredClient; headlineClient?: StructuredClient }) {
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), ...clients });
}

describe("POST /api/optimizer-section", () => {
  it("analyzes the current headline", async () => {
    const prompts: string[] = [];
    const client = fakeClient({ status: "improve", summary: "Your headline only names your school.", findings: [{ aspect: "skills", verdict: "improve", note: "Add Python or C++." }], ideas: [] }, prompts);
    const res = await request(appWith({ sectionClient: client })).post("/api/optimizer-section").send({ profile, section: "headline", present: true });
    expect(res.body).toMatchObject({ status: "section", section: "headline", state: "improve", findings: [{ aspect: "skills" }] });
    expect(prompts[0]).toContain('current headline:\n"Student at Westfield High"');
  });

  it("rejects sections without a detail analysis", async () => {
    const res = await request(appWith({})).post("/api/optimizer-section").send({ profile, section: "skills", present: true });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/optimizer-headlines", () => {
  const body = { profile, currentHeadline: "Student at Westfield High", targetRole: "Software Engineer", keywords: "C++, robotics", additionalContext: "", language: "English" };

  it("sends the generator inputs and returns grounded options", async () => {
    const prompts: string[] = [];
    const client = fakeClient({ options: [{ label: "Technical", headline: "Aspiring Software Engineer | Python & C++" }, { label: "Bad", headline: "Senior Engineer at Google" }] }, prompts);
    const res = await request(appWith({ headlineClient: client })).post("/api/optimizer-headlines").send(body);
    expect(res.body).toMatchObject({ status: "headlines", options: [{ label: "Technical", headline: "Aspiring Software Engineer | Python & C++" }] });
    expect(prompts[0]).toContain('target role: "Software Engineer"');
    expect(prompts[0]).toContain('keywords to include where relevant: "C++, robotics"');
    expect(prompts[0]).toContain("language: English");
  });

  it("reports unavailable when nothing survives grounding", async () => {
    const client = fakeClient({ options: [{ label: "Bad", headline: "Senior Engineer at Google" }] });
    const res = await request(appWith({ headlineClient: client })).post("/api/optimizer-headlines").send(body);
    expect(res.body).toEqual({ status: "unavailable", reason: "ungrounded_headlines" });
  });
});
