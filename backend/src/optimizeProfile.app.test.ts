import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { StructuredClient } from "./openai/structuredClient";

const profile = {
  identity: "me",
  evidence: [{ id: "experience:0", section: "experience", text: "Web Lead — Built the club website", evidenceType: "experience" }],
};
const body = {
  profile,
  sections: [
    { section: "experience", present: true, itemCount: 1, evidenceIds: ["experience:0"] },
    { section: "projects", present: false, itemCount: null, evidenceIds: [] },
  ],
  userContext: "",
};

function fakeClient(response: unknown, prompts: string[] = []): StructuredClient {
  return {
    complete: async (_system, user) => {
      prompts.push(user);
      return response;
    },
  };
}

function appWith(clients: { optimizerClient?: StructuredClient; draftClient?: StructuredClient }) {
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), ...clients });
}

describe("POST /api/optimize-profile", () => {
  it("responds not_configured without an API key", async () => {
    const res = await request(createApp({ config: loadConfig({}) })).post("/api/optimize-profile").send(body);
    expect(res.body).toEqual({ status: "not_configured" });
  });

  it("rejects a malformed request as 400", async () => {
    const res = await request(appWith({})).post("/api/optimize-profile").send({ profile });
    expect(res.status).toBe(400);
  });

  it("returns validated assessments and labels user context in the prompt", async () => {
    const prompts: string[] = [];
    const client = fakeClient(
      {
        summary: "A short profile.",
        assessments: [
          { section: "experience", state: "improve", impact: "high", reason: "The entry has no result.", sourceType: "linkedin_profile", evidenceIds: ["experience:0"], contextQuote: null, suggestions: [] },
          { section: "projects", state: "add", impact: "low", reason: "Add your Mars Rover project.", sourceType: "general_best_practice", evidenceIds: [], contextQuote: null, suggestions: [] },
        ],
      },
      prompts,
    );
    const res = await request(appWith({ optimizerClient: client })).post("/api/optimize-profile").send({ ...body, userContext: "I volunteer at a shelter." });
    expect(res.body.status).toBe("optimizer");
    expect(res.body.sections.map((s: { section: string }) => s.section)).toEqual(["experience", "projects"]);
    expect(res.body.sections[1].reason).not.toContain("Mars Rover");
    expect(prompts[0]).toContain("userContext (NOT on LinkedIn)");
    expect(prompts[0]).toContain("I volunteer at a shelter.");
  });
});

describe("POST /api/optimizer-draft", () => {
  const draftBody = { profile, section: "experience", evidenceId: "experience:0", guidance: "Lead with the result." };

  it("returns a grounded draft", async () => {
    const res = await request(appWith({ draftClient: fakeClient({ draft: "• Built the club website as Web Lead" }) })).post("/api/optimizer-draft").send(draftBody);
    expect(res.body).toMatchObject({ status: "draft", section: "experience", draft: "• Built the club website as Web Lead" });
  });

  it("refuses a draft with invented facts", async () => {
    const res = await request(appWith({ draftClient: fakeClient({ draft: "• Grew traffic 400% at Microsoft" }) })).post("/api/optimizer-draft").send(draftBody);
    expect(res.body).toEqual({ status: "unavailable", reason: "ungrounded_draft" });
  });

  it("rejects non-text sections and unknown experience entries", async () => {
    const app = appWith({ draftClient: fakeClient({ draft: "x" }) });
    expect((await request(app).post("/api/optimizer-draft").send({ ...draftBody, section: "skills" })).status).toBe(400);
    expect((await request(app).post("/api/optimizer-draft").send({ ...draftBody, evidenceId: "experience:9" })).status).toBe(400);
  });
});
