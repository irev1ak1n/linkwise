// Regression guards for the writing-quality rules baked into SYSTEM_PROMPT — these check that
// the key instructions are still present in the prompt text, protecting against a future edit
// accidentally dropping one. This does NOT prove the model actually follows them (that's a
// live-verification concern — see the project's own live-testing notes), only that the
// instruction text itself hasn't regressed.
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "./prompt";

describe("SYSTEM_PROMPT - summary writing rules", () => {
  it("specifies the 3-4 sentence requirement", () => {
    expect(SYSTEM_PROMPT).toMatch(/3 or 4 sentences/);
  });

  it("specifies the word count target and hard ceiling", () => {
    expect(SYSTEM_PROMPT).toMatch(/50 words/);
    expect(SYSTEM_PROMPT).toMatch(/[Nn]ever exceed 60 words/);
  });

  it("forbids restating the headline, listing criteria, and mentioning scores", () => {
    expect(SYSTEM_PROMPT).toMatch(/restate the candidate's LinkedIn headline/);
    expect(SYSTEM_PROMPT).toMatch(/list criteria one by one/);
    expect(SYSTEM_PROMPT).toMatch(/scores, percentages/);
  });
});

describe("SYSTEM_PROMPT - missing vs unknown vs weak", () => {
  it("distinguishes all three evidence-strength states in the grounding rules", () => {
    expect(SYSTEM_PROMPT).toMatch(/"missing"/);
    expect(SYSTEM_PROMPT).toMatch(/"unknown"/);
    expect(SYSTEM_PROMPT).toMatch(/"weak"/);
    expect(SYSTEM_PROMPT).toMatch(/Never turn a lack of evidence into a confirmed negative/);
  });
});

describe("SYSTEM_PROMPT - strengths must be goal-relevant", () => {
  it("instructs the model not to include unrelated positive facts", () => {
    expect(SYSTEM_PROMPT).toMatch(/never include an unrelated positive fact/);
    expect(SYSTEM_PROMPT).toMatch(/robotics experience should not appear as a strength for a goal that only asks about languages/);
  });

  it("specifies the 10-25 word explanation length for strengths", () => {
    expect(SYSTEM_PROMPT).toMatch(/10 to 25 words/);
  });
});

describe("SYSTEM_PROMPT - recommendation reason", () => {
  it("specifies the 20-35 word target and mentions strongest reason + largest gap", () => {
    expect(SYSTEM_PROMPT).toMatch(/20 to 35 words/);
    expect(SYSTEM_PROMPT).toMatch(/strongest reason in favor and the largest gap/);
  });
});

describe("SYSTEM_PROMPT - experience assessment", () => {
  it("forbids using age as evidence and assuming seniority from education alone", () => {
    expect(SYSTEM_PROMPT).toMatch(/[Nn]ever use age as evidence/);
    expect(SYSTEM_PROMPT).toMatch(/[Nn]ever assume seniority purely from education/);
  });
});

describe("SYSTEM_PROMPT - banned phrases and natural wording", () => {
  it("lists the banned generic phrases", () => {
    for (const phrase of [
      "Based on the provided information",
      "The candidate demonstrates",
      "This individual possesses",
      "It is worth noting",
      "Overall, this candidate",
      "According to their profile",
    ]) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it("suggests natural direct phrasing instead", () => {
    expect(SYSTEM_PROMPT).toMatch(/His profile shows\.\.\./);
    expect(SYSTEM_PROMPT).toMatch(/This requirement is not confirmed\./);
  });
});

describe("SYSTEM_PROMPT - unchanged guardrail-critical rules", () => {
  it("still preserves every conceptual distinction from before this writing-quality pass", () => {
    for (const phrase of [
      "a member of a group is not the same as someone who mentors or leads it",
      "a participant is not the same as a leader",
      "a student is not the same as a working professional",
      "a school project is not the same as professional work experience",
      "engineering education is not the same as professional engineering employment",
    ]) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });

  it("still states the deterministic system has final say on score and recommendation", () => {
    expect(SYSTEM_PROMPT).toMatch(/final say on the displayed match score, disqualification status, and final recommendation label/);
  });

  it("still forbids inventing evidence IDs or unsupported claims", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent an evidence ID/);
  });
});
