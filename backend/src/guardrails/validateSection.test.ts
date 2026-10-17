import { describe, expect, it } from "vitest";
import { isGroundedHeadline, validateHeadlineOptions, validateSectionAnalysis } from "./validateSection";
import type { HeadlineGenerationRequest, SectionAnalysisRequest } from "../validation/sectionRequestSchema";

const profile = {
  identity: "me",
  evidence: [
    { id: "headline:0", section: "headline" as const, text: "Aspiring Software Engineer | Senior @ Westfield High", evidenceType: "headline" },
    { id: "education:0", section: "education" as const, text: "Code Academy — Skills in Python, C++, web development, robotics", evidenceType: "education" },
    { id: "experience:0", section: "experience" as const, text: "Website Developer — Robotics Club — Built a site used by 300+ students", evidenceType: "experience" },
  ],
};

const sectionRequest = (present = true): SectionAnalysisRequest => ({ profile, section: "banner", present, userContext: "" });

const generation: HeadlineGenerationRequest = {
  profile,
  currentHeadline: profile.evidence[0].text,
  targetRole: "Software Engineer",
  keywords: "C++, full-stack, robotics",
  additionalContext: "",
  language: "English",
  userContext: "",
};

describe("validateSectionAnalysis", () => {
  it("decides the banner state from presence, not the model", () => {
    const empty = { status: "strong" as const, summary: "", findings: [], ideas: [] };
    expect(validateSectionAnalysis(empty, sectionRequest(false)).state).toBe("improve");
    expect(validateSectionAnalysis(empty, sectionRequest(true)).state).toBe("strong");
  });

  it("keeps only banner ideas grounded in the profile", () => {
    const result = validateSectionAnalysis(
      { status: "strong", summary: "", findings: [{ aspect: "role", verdict: "good", note: "x" }], ideas: ["A screenshot of the Robotics Club site you built", "A photo from your NASA internship"] },
      sectionRequest(),
    );
    expect(result.ideas).toEqual(["A screenshot of the Robotics Club site you built"]);
    expect(result.findings).toEqual([]);
  });
});

describe("headline generation grounding", () => {
  it("accepts headlines built from evidence and the user's own inputs", () => {
    expect(isGroundedHeadline("Aspiring Software Engineer | C++ & Full-Stack Web Developer | Robotics", generation)).toBe(true);
  });

  it("rejects invented employers, credentials, awards, and numbers", () => {
    expect(isGroundedHeadline("Software Engineer at Microsoft", generation)).toBe(false);
    expect(isGroundedHeadline("AWS certified full-stack developer", generation)).toBe(false);
    expect(isGroundedHeadline("Award-winning robotics developer", generation)).toBe(false);
    expect(isGroundedHeadline("Built sites for 5,000 users", generation)).toBe(false);
    expect(isGroundedHeadline("x".repeat(221), generation)).toBe(false);
  });

  it("drops duplicates, the current headline, and ungrounded options", () => {
    const options = validateHeadlineOptions(
      {
        options: [
          { label: "Balanced", headline: "Aspiring Software Engineer | C++ & Web Development" },
          { label: "Same", headline: "aspiring software engineer |  C++ & web development" },
          { label: "Current", headline: profile.evidence[0].text },
          { label: "Invented", headline: "Software Engineer at Microsoft" },
          { label: "Achievement", headline: "Website Developer for 300+ students | Python, C++" },
        ],
      },
      generation,
    );
    expect(options.map((o) => o.label)).toEqual(["Balanced", "Achievement"]);
  });
});
