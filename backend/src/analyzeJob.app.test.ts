import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { StructuredClient } from "./openai/structuredClient";

const description = `Software Engineering Intern (Fall)

Pay range: $28/hr - $31/hr. This is a hybrid role in Pittsburgh, PA.

What you'll do
- Build and maintain internal APIs with senior engineers.
- Test and debug applications.

Minimum qualifications
- Currently pursuing a CS or related degree.
- Experience developing applications using Python or another object-oriented language.

Preferred qualifications
- Previous internship experience.

Must be authorized to work in the United States. Sponsorship is not available.`;

const body = {
  job: { jobId: "123", title: "Software Engineering Intern", company: "Acme", headerLines: ["Pittsburgh, PA · 2 days ago", "Hybrid", "Internship"], description, companyText: "Acme builds logistics software. 1,001-5,000 employees" },
  criteria: [
    { id: "c1", label: "Software development opportunity", importance: "MUST_HAVE" },
    { id: "c2", label: "Remote", importance: "PREFERRED" },
    { id: "c3", label: "Speaks multiple languages", importance: "OPTIONAL" },
  ],
};

const f = (text: string, quote: string) => ({ text, quote });
const response = {
  summary: "This is a hybrid software engineering internship in Pittsburgh, PA that pays $28 to $31 an hour. You would build and test internal tools with senior engineers, and it is aimed at students currently working toward a computer science degree.",
  responsibilities: [f("Build and maintain internal APIs", "Build and maintain internal APIs with senior engineers"), f("Run the Mars rover program", "Run the Mars rover program every day")],
  required: [f("Pursuing a CS degree", "Currently pursuing a CS or related degree")],
  preferred: [f("Internship experience", "Previous internship experience")],
  technicalSkills: [f("Python", "developing applications using Python or another object-oriented language")],
  professionalSkills: [],
  education: [],
  experience: [],
  restrictions: [f("Must be authorized to work in the U.S.", "Must be authorized to work in the United States"), f("No sponsorship", "Sponsorship is not available")],
  benefits: [],
  company: { industry: "Logistics Software", size: "1,001-5,000 employees", headquarters: "", focus: "Logistics software", focusQuote: "Acme builds logistics software" },
  keyEvidence: [f("Hybrid in Pittsburgh", "This is a hybrid role in Pittsburgh, PA")],
  criteria: [
    { criterionId: "c1", status: "strong", reasoning: "The job involves building and debugging applications.", quote: "Test and debug applications" },
    { criterionId: "c2", status: "none", reasoning: "The listing says hybrid.", quote: "This is a hybrid role in Pittsburgh, PA" },
    { criterionId: "c3", status: "strong", reasoning: "Invented.", quote: "Fluent in Spanish and French is required" },
  ],
};

function appWith(client: StructuredClient) {
  return createApp({ config: loadConfig({ OPENAI_API_KEY: "sk-test" }), jobClient: client });
}
const fake = (value: unknown, prompts: string[] = []): StructuredClient => ({ complete: async (_s, user) => (prompts.push(user), value) });

describe("POST /api/analyze-job", () => {
  it("sends the whole posting and the criteria, and keeps only findings whose quotes are in the posting", async () => {
    const prompts: string[] = [];
    const res = await request(appWith(fake(response, prompts))).post("/api/analyze-job").send(body);
    expect(res.body).toMatchObject({ status: "job", jobId: "123" });
    expect(prompts[0]).toContain("Must be authorized to work in the United States");
    expect(prompts[0]).toContain("Software development opportunity");
    const findings = res.body.findings;
    expect(findings.responsibilities.map((r: { text: string }) => r.text)).toEqual(["Build and maintain internal APIs"]);
    expect(findings.responsibilities[0].evidence).toContain("senior engineers");
    expect(findings.required[0].evidence).toBe("Currently pursuing a CS or related degree");
    expect(findings.restrictions).toHaveLength(2);
    expect(findings.company).toMatchObject({ industry: "Logistics Software", headquarters: "", size: "1,001-5,000 employees", focus: "Logistics software" });
  });

  it("keeps a summary whose numbers are in the posting, and drops one that invents a number", async () => {
    const kept = await request(appWith(fake(response))).post("/api/analyze-job").send(body);
    expect(kept.body.findings.summary).toContain("$28 to $31");
    const invented = await request(appWith(fake({ ...response, summary: "This internship pays $45 an hour and runs for 24 months in Pittsburgh, PA with senior engineers." }))).post("/api/analyze-job").send(body);
    expect(invented.body.findings.summary).toBe("");
  });

  it("returns a criterion verdict only when the posting's own words back it, otherwise unknown", async () => {
    const res = await request(appWith(fake(response))).post("/api/analyze-job").send(body);
    const byId = Object.fromEntries(res.body.findings.criteria.map((c: { criterionId: string }) => [c.criterionId, c]));
    expect(byId.c1).toMatchObject({ status: "strong", evidence: "Test and debug applications" });
    expect(byId.c2).toMatchObject({ status: "none", evidence: "This is a hybrid role in Pittsburgh, PA" });
    expect(byId.c3.status).toBe("unknown");
    expect(byId.c3.evidence).toBe("");
  });

  it("rejects a malformed request without calling the model", async () => {
    const prompts: string[] = [];
    const res = await request(appWith(fake(response, prompts))).post("/api/analyze-job").send({ job: { jobId: "1" } });
    expect(res.status).toBe(400);
    expect(prompts).toHaveLength(0);
  });
});
