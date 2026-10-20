import { describe, expect, it } from "vitest";
import { isGrounded, validateDraft, validateOptimizerResponse } from "./validateOptimizer";
import type { SectionAssessment } from "../openai/optimizerSchema";
import type { OptimizeProfileRequest, OptimizerSection } from "../validation/optimizerRequestSchema";

function requestWith(userContext = ""): OptimizeProfileRequest {
  return {
    profile: {
      identity: "me",
      evidence: [
        { id: "headline:0", section: "headline", text: "Student at Westfield High", evidenceType: "headline" },
        { id: "experience:0", section: "experience", text: "Web Lead — Robotics Club — Built the club website in React with 300 monthly visitors", evidenceType: "experience" },
      ],
    },
    sections: (["headline", "experience", "projects", "certifications", "featured"] as OptimizerSection[]).map((section) => ({
      section,
      present: section === "headline" || section === "experience",
      itemCount: null,
      evidenceIds: section === "headline" ? ["headline:0"] : section === "experience" ? ["experience:0"] : [],
    })),
    userContext,
  };
}

function assessment(partial: Partial<SectionAssessment> & Pick<SectionAssessment, "section" | "state">): SectionAssessment {
  return { impact: "medium", reason: "Fine.", sourceType: "linkedin_profile", evidenceIds: [], contextQuote: null, suggestions: [], ...partial };
}

function validate(assessments: SectionAssessment[], context = "") {
  return validateOptimizerResponse({ summary: "", assessments }, requestWith(context)).sections;
}

describe("isGrounded", () => {
  it("rejects names and numbers that the sources never mention", () => {
    expect(isGrounded("Add your AWS certification.", "Built a website")).toBe(false);
    expect(isGrounded("Mention the 40 users.", "300 monthly visitors")).toBe(false);
    expect(isGrounded("Lead with the 300 monthly visitors from React.", "Built in React with 300 monthly visitors")).toBe(true);
    expect(isGrounded("Consider adding a link to Featured.", "")).toBe(true);
    expect(isGrounded("Both entries list credential IDs.", "Credential ID DN-1")).toBe(true);
  });
});

describe("validateOptimizerResponse", () => {
  it("keeps a missing section with no evidence only as conditional advice", () => {
    const [projects] = validate([assessment({ section: "projects", state: "add", sourceType: "general_best_practice", reason: "Add your Robotics Simulator project." })]);
    expect(projects.reason).toMatch(/^Projects is missing\. If you have/);
    expect(projects.sourceType).toBe("general_best_practice");
    expect(projects.evidenceIds).toEqual([]);
  });

  it("keeps an evidence-based add that names only profile items", () => {
    const [projects] = validate([
      assessment({ section: "projects", state: "add", impact: "high", evidenceIds: ["experience:0", "bogus:1"], reason: "Your Experience describes the Robotics Club website built in React; listing it under Projects makes it easier to find." }),
    ]);
    expect(projects.sourceType).toBe("linkedin_profile");
    expect(projects.evidenceIds).toEqual(["experience:0"]);
    expect(projects.reason).toContain("Robotics Club");
  });

  it("never lets an invented certification through", () => {
    const [certs] = validate([assessment({ section: "certifications", state: "add", evidenceIds: ["experience:0"], reason: "Add your AWS Solutions Architect certification." })]);
    expect(certs.reason).not.toContain("AWS");
    expect(certs.sourceType).toBe("general_best_practice");
  });

  it("accepts user context only with a quote from it, labelled as context", () => {
    const context = "I have an AWS certification that is not on LinkedIn.";
    const good = assessment({ section: "certifications", state: "add", sourceType: "user_context", contextQuote: "AWS certification", reason: "You mentioned an AWS certification, which is not on your profile yet." });
    expect(validate([good], context)[0]).toMatchObject({ sourceType: "user_context", reason: good.reason });
    expect(validate([{ ...good, contextQuote: null }], context)[0].sourceType).toBe("general_best_practice");
    expect(validate([good], "")[0].reason).not.toContain("AWS");
  });

  it("enforces presence: no add for present sections, no improve for missing ones", () => {
    const result = validate([
      assessment({ section: "headline", state: "add", sourceType: "general_best_practice", reason: "If you have a headline, add it." }),
      assessment({ section: "featured", state: "improve", reason: "Improve it." }),
    ]);
    expect(result).toEqual([]);
  });

  it("drops ungrounded suggestions and clears suggestions on strong sections", () => {
    const [experience, headline] = validate([
      assessment({ section: "experience", state: "improve", evidenceIds: ["experience:0"], reason: "The result comes last.", suggestions: ["Start with the 300 monthly visitors.", "Mention your 5,000 GitHub stars."] }),
      assessment({ section: "headline", state: "strong", impact: "high", evidenceIds: ["headline:0"], reason: "Clear.", suggestions: ["Keep it."] }),
    ]);
    expect(experience.suggestions).toEqual(["Start with the 300 monthly visitors."]);
    expect(headline).toMatchObject({ state: "strong", impact: "low", suggestions: [] });
  });

  it("lets general advice on a present section cite what the profile shows, but not the user context", () => {
    const request = requestWith("I have an AWS certification.");
    request.sections.push({ section: "skills", present: true, itemCount: 50, evidenceIds: [] });
    const skills = { section: "skills" as const, state: "improve" as const, impact: "medium" as const, sourceType: "general_best_practice" as const, evidenceIds: [], contextQuote: null, suggestions: [] };
    const [kept] = validateOptimizerResponse({ summary: "", assessments: [{ ...skills, reason: "With 50 skills listed, put React first." }] }, request).sections;
    expect(kept?.reason).toBe("With 50 skills listed, put React first.");
    expect(validateOptimizerResponse({ summary: "", assessments: [{ ...skills, reason: "Add AWS to your skills." }] }, request).sections).toEqual([]);
    const [shown] = validateOptimizerResponse({ summary: "", assessments: [{ ...skills, sourceType: "linkedin_profile", reason: "The profile lists 50 skills." }] }, request).sections;
    expect(shown?.sourceType).toBe("linkedin_profile");
  });

  it("keeps only the first assessment per known section", () => {
    const result = validate([
      assessment({ section: "experience", state: "strong", evidenceIds: ["experience:0"], reason: "Good." }),
      assessment({ section: "experience", state: "improve", evidenceIds: ["experience:0"], reason: "Bad." }),
    ]);
    expect(result).toHaveLength(1);
  });
});

describe("validateDraft", () => {
  const draftRequest = { profile: requestWith().profile, section: "headline" as const, evidenceId: null, guidance: "", userContext: "AWS certified" };

  it("accepts a draft built from known facts", () => {
    expect(validateDraft("Robotics Club Web Lead building React sites | AWS certified", draftRequest)).not.toBeNull();
  });

  it("rejects invented employers, numbers, or overly long drafts", () => {
    expect(validateDraft("Software Engineer at Google", draftRequest)).toBeNull();
    expect(validateDraft("Web Lead with 10,000 visitors", draftRequest)).toBeNull();
    expect(validateDraft("x".repeat(300), draftRequest)).toBeNull();
  });
});

describe("overall summary", () => {
  // The request has Headline and Experience; Projects, Certifications, and Featured are missing.
  const plain =
    "Your profile shows clear role history and a focused headline. The biggest gap is that your work is hard to find because there is no Projects or Featured section. That matters because visitors judge your skills by what they can open and see. Your experience entry also puts its strongest result at the very end, where people may skip it. Add a Projects section with your best work so visitors can see it quickly. Then move the most important result to the start of each role.";
  const summaryOf = (summary: string) => validateOptimizerResponse({ summary, assessments: [] }, requestWith()).summary;

  it("keeps an 80 to 100 word plain summary that names real sections and real problems", () => {
    expect(plain.split(/\s+/).length).toBeGreaterThanOrEqual(80);
    expect(plain.split(/\s+/).length).toBeLessThanOrEqual(100);
    expect(summaryOf(plain)).toBe(plain);
  });

  it("rewrites semicolons and dashes between clauses into plain sentences", () => {
    const dashed = plain.replace("headline. The biggest", "headline; the biggest").replace("hard to find because", "hard to find \u2014 because");
    const cleaned = summaryOf(dashed);
    expect(cleaned).not.toMatch(/[;\u2014\u2013]/);
    expect(cleaned).toContain("headline. The biggest gap");
  });

  it("trims a long summary to whole leading sentences, never mid-sentence", () => {
    const extra = " Your experience entries could also lead with the result before the task, which makes each role faster to read.";
    const long = plain + extra + extra;
    const cleaned = summaryOf(long);
    expect(cleaned.split(/\s+/).length).toBeLessThanOrEqual(105);
    expect(cleaned.length).toBeLessThan(long.length);
    expect(long.startsWith(cleaned)).toBe(true);
    expect(cleaned).toMatch(/[.!?]$/);
  });

  it("drops a summary that calls a present section missing", () => {
    expect(summaryOf(plain.replace("no Projects or Featured section", "no Experience section"))).toBe("");
    expect(summaryOf(plain.replace("Add a Projects section", "Add a Headline section"))).toBe("");
    expect(summaryOf("Your profile is missing a headline entirely. It needs one before anything else. Add a short line about what you do.")).toBe("");
  });

  it("drops a summary that lists numbers or achievements, or is too short to help", () => {
    expect(summaryOf(plain.replace("clear role history", "300 monthly visitors"))).toBe("");
    expect(summaryOf("A focused profile. Add more.")).toBe("");
    expect(summaryOf("Your profile shows clear role history. Your work is hard to find. Add a Projects section.")).toBe("");
  });
});
