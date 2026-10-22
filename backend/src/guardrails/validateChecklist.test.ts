import { describe, expect, it } from "vitest";
import { validateChecklist } from "./validateChecklist";
import type { ChecklistRequest } from "../validation/checklistRequestSchema";

const request = (headline: string): ChecklistRequest => ({
  profile: { identity: "me", evidence: [{ id: "headline:0", section: "headline", text: headline, evidenceType: "headline" }] },
  section: "headline",
  criteria: [{ id: "headline-differentiator", label: "Includes a strong differentiator", advice: "" }],
  userContext: "",
});
const pass = { results: [{ criterionId: "headline-differentiator", status: "pass" as const, explanation: "Your headline names your school and your goal.", evidenceIds: ["headline:0"] }] };

describe("headline differentiator", () => {
  it("does not pass on where someone studies or a plain title", () => {
    const [verdict] = validateChecklist(pass, request("Aspiring Software Engineer | Senior at Westfield High School"));
    expect(verdict).toMatchObject({ criterionId: "headline-differentiator", status: "improve" });
    expect(verdict!.explanation).toContain("background rather than something that sets you apart");
  });

  it("keeps a pass when the headline carries real proof", () => {
    for (const headline of ["Aspiring Software Engineer | Built a site used by 4,000+ students", "Software Engineer | Regional robotics finalist", "Student Developer | Team captain, 9 years of training"]) {
      expect(validateChecklist(pass, request(headline))[0]!.status).toBe("pass");
    }
  });
});
