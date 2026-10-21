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

function appWith(clients: { sectionClient?: StructuredClient; headlineClient?: StructuredClient; aboutClient?: StructuredClient }) {
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), ...clients });
}

describe("POST /api/optimizer-section", () => {
  it("suggests banner ideas from the profile", async () => {
    const prompts: string[] = [];
    const client = fakeClient({ status: "strong", summary: "", findings: [], ideas: ["A Python and C++ code motif"] }, prompts);
    const res = await request(appWith({ sectionClient: client })).post("/api/optimizer-section").send({ profile, section: "banner", present: true });
    expect(res.body).toMatchObject({ status: "section", section: "banner", state: "strong", ideas: ["A Python and C++ code motif"] });
    expect(prompts[0]).toContain("custom banner present: true");
  });

  it("rejects sections without a detail analysis, including the headline, which the checklist covers", async () => {
    for (const section of ["skills", "headline"]) {
      const res = await request(appWith({})).post("/api/optimizer-section").send({ profile, section, present: true });
      expect(res.status).toBe(400);
    }
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

describe("POST /api/optimizer-abouts", () => {
  const body = { profile, currentAbout: "", targetRole: "Software Engineer", standOut: "projects", additionalContext: "", language: "English", variation: 2 };
  const text = (extra: string) => `I am a student at Westfield High. ${extra} I studied Python and C++ at Code Academy and enjoy building practical software that other people use. `.repeat(6).trim();

  it("asks for three different styles, passes the regeneration number, and returns grounded options", async () => {
    const prompts: string[] = [];
    const client = fakeClient({ options: [{ label: "Balanced", text: text("I keep learning every week.") }, { label: "Impact", text: "I invented a rocket at NASA." }] }, prompts);
    const res = await request(appWith({ aboutClient: client })).post("/api/optimizer-abouts").send(body);
    expect(res.body.status).toBe("abouts");
    expect(res.body.options.map((o: { label: string }) => o.label)).toEqual(["Balanced"]);
    expect(prompts[0]).toContain("variation: 2");
    expect(prompts[0]).toContain("Code Academy");
  });

  it("says so when nothing survives grounding, and rejects a malformed request", async () => {
    const client = fakeClient({ options: [{ label: "Bad", text: "I invented a rocket at NASA." }] });
    const res = await request(appWith({ aboutClient: client })).post("/api/optimizer-abouts").send(body);
    expect(res.body).toEqual({ status: "unavailable", reason: "ungrounded_abouts" });
    expect((await request(appWith({ aboutClient: client })).post("/api/optimizer-abouts").send({ profile: 3 })).status).toBe(400);
  });
});
