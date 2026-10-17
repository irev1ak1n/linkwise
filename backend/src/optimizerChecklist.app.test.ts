import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { StructuredClient } from "./openai/structuredClient";

const body = {
  profile: {
    identity: "me",
    evidence: [
      { id: "headline:0", section: "headline", text: "Aspiring Software Engineer", evidenceType: "headline" },
      { id: "about:0", section: "about", text: "I have studied software development for nine years and built a yearbook website used by 300+ students.", evidenceType: "about" },
    ],
  },
  section: "about",
  criteria: [
    { id: "about-who", label: "Explains who you are and your direction" },
    { id: "about-accomplishments", label: "Highlights meaningful accomplishments" },
    { id: "about-differentiator", label: "Shows what sets you apart" },
  ],
};

function appWith(response: unknown, calls: string[] = []) {
  const checklistClient: StructuredClient = {
    complete: async (_system, user) => {
      calls.push(user);
      return response;
    },
  };
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), checklistClient });
}

describe("POST /api/optimizer-checklist", () => {
  it("evaluates all of a section's criteria in one call", async () => {
    const calls: string[] = [];
    const res = await request(
      appWith(
        {
          results: [
            { criterionId: "about-who", status: "pass", explanation: "Your About section says you have studied software development for nine years.", evidenceIds: ["about:0"] },
            { criterionId: "about-accomplishments", status: "pass", explanation: "You mention a yearbook website used by 300+ students.", evidenceIds: ["about:0", "made-up:1"] },
            { criterionId: "about-differentiator", status: "improve", explanation: "Your About section doesn't say what sets your approach apart.", evidenceIds: [] },
          ],
        },
        calls,
      ),
    )
      .post("/api/optimizer-checklist")
      .send(body);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("about-differentiator");
    expect(res.body).toMatchObject({ status: "checklist", section: "about" });
    expect(res.body.results.map((r: { criterionId: string; status: string }) => [r.criterionId, r.status])).toEqual([
      ["about-who", "pass"],
      ["about-accomplishments", "pass"],
      ["about-differentiator", "improve"],
    ]);
    expect(res.body.results[1].evidenceIds).toEqual(["about:0"]);
  });

  it("drops verdicts that invent evidence or answer criteria nobody asked about", async () => {
    const res = await request(
      appWith({
        results: [
          { criterionId: "about-who", status: "pass", explanation: "You mention your Google internship.", evidenceIds: [] },
          { criterionId: "about-accomplishments", status: "pass", explanation: "You reached 5,000 students.", evidenceIds: [] },
          { criterionId: "unknown", status: "pass", explanation: "Fine.", evidenceIds: [] },
          { criterionId: "about-differentiator", status: "improve", explanation: "Your About section doesn't say what sets you apart.", evidenceIds: [] },
          { criterionId: "about-differentiator", status: "pass", explanation: "Duplicate.", evidenceIds: [] },
        ],
      }),
    )
      .post("/api/optimizer-checklist")
      .send(body);
    expect(res.body.results).toEqual([{ criterionId: "about-differentiator", status: "improve", explanation: "Your About section doesn't say what sets you apart.", evidenceIds: [] }]);
  });

  it("rejects sections without AI criteria", async () => {
    const res = await request(appWith({ results: [] })).post("/api/optimizer-checklist").send({ ...body, section: "photo" });
    expect(res.status).toBe(400);
  });
});
