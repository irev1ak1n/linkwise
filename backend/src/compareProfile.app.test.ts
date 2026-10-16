import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { StructuredClient } from "./openai/structuredClient";

const items = [
  { id: "a", section: "experience", context: "Web Developer", previous: "Built a website serving 300+ students", current: "Designed a website used by more than 300 students" },
  { id: "b", section: "experience", context: "Developer", previous: "Built a staff dashboard", current: "Built a staff dashboard allowing advisers to manage student content" },
];

function appWith(response: unknown, prompts: string[] = []) {
  const compareClient: StructuredClient = {
    complete: async (_system, user) => {
      prompts.push(user);
      return response;
    },
  };
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), compareClient });
}

const unchanged = (id: string) => ({ id, factsChanged: false, significance: "none", direction: "changed", title: "", explanation: "", previousValue: "", currentValue: "" });

describe("POST /api/compare-profile", () => {
  it("returns grounded meaningful changes and marks paraphrases unchanged", async () => {
    const prompts: string[] = [];
    const res = await request(
      appWith(
        {
          results: [
            unchanged("a"),
            { id: "b", factsChanged: true, significance: "meaningful", direction: "improved", title: "New responsibility", explanation: "Advisers can now manage student content.", previousValue: "", currentValue: "allowing advisers to manage student content" },
          ],
        },
        prompts,
      ),
    )
      .post("/api/compare-profile")
      .send({ items });
    expect(res.body).toEqual({
      status: "comparison",
      model: expect.any(String),
      results: [
        { id: "a", meaningful: false },
        { id: "b", meaningful: true, significance: "meaningful", direction: "improved", title: "New responsibility", explanation: "Advisers can now manage student content.", previousValue: "", currentValue: "allowing advisers to manage student content" },
      ],
    });
    expect(prompts[0]).toContain("Built a staff dashboard allowing advisers");
  });

  it("drops a change whose quotes appear in neither text, ids it was never asked about, and invented numbers", async () => {
    const res = await request(
      appWith({
        results: [
          { id: "a", factsChanged: true, significance: "major", direction: "improved", title: "Bigger audience", explanation: "Now 5,000 students.", previousValue: "", currentValue: "5,000 students" },
          { id: "b", factsChanged: true, significance: "meaningful", direction: "improved", title: "New responsibility", explanation: "Now serves 5,000 advisers.", previousValue: "", currentValue: "allowing advisers" },
          { id: "zzz", factsChanged: true, significance: "major", direction: "improved", title: "Invented", explanation: "", previousValue: "", currentValue: "x" },
        ],
      }),
    )
      .post("/api/compare-profile")
      .send({ items });
    expect(res.body.results).toEqual([{ id: "b", meaningful: true, significance: "meaningful", direction: "improved", title: "New responsibility", explanation: "", previousValue: "", currentValue: "allowing advisers" }]);
  });

  it("rejects malformed requests", async () => {
    const res = await request(appWith({ results: [] })).post("/api/compare-profile").send({ items: [] });
    expect(res.status).toBe(400);
  });

  it("reports not_configured without an API key", async () => {
    const res = await request(createApp({ config: loadConfig({}) })).post("/api/compare-profile").send({ items });
    expect(res.body).toEqual({ status: "not_configured" });
  });
});
