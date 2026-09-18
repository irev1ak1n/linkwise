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

  it("still forbids inventing evidence IDs or unsupported claims", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent an evidence ID/);
  });
});

describe("SYSTEM_PROMPT - AI-first scoring", () => {
  it("tells the model it directly determines the final matchPercent and confidenceLevel", () => {
    expect(SYSTEM_PROMPT).toMatch(/YOU DETERMINE THE FINAL SCORE/);
    expect(SYSTEM_PROMPT).toMatch(/not recomputed by a separate formula afterward/);
  });

  it("states that a confirmed Excluded disqualification is the one thing that can still override the score", () => {
    expect(SYSTEM_PROMPT).toMatch(/confirmed by strong, grounded evidence, the system automatically disqualifies/);
  });

  it("gives calibration bands for matchPercent without presenting them as a rigid formula", () => {
    expect(SYSTEM_PROMPT).toMatch(/calibration, not a rigid formula/);
    expect(SYSTEM_PROMPT).toMatch(/90-100/);
    expect(SYSTEM_PROMPT).toMatch(/0-29/);
  });

  it("gives Low/Medium/High confidence guidance distinct from match quality", () => {
    expect(SYSTEM_PROMPT).toMatch(/"high": the profile contains enough direct evidence/);
    expect(SYSTEM_PROMPT).toMatch(/"low": the profile is sparse/);
    expect(SYSTEM_PROMPT).toMatch(/do not lower the score just because confidence isn't "high"/);
  });

  it("gives concrete semantic-equivalence examples (Webmaster, tutor, languages, membership, team captain)", () => {
    expect(SYSTEM_PROMPT).toMatch(/"Webmaster".+direct evidence of web development skills/);
    expect(SYSTEM_PROMPT).toMatch(/"Programming Tutor" is direct evidence of programming experience/);
    expect(SYSTEM_PROMPT).toMatch(/multiple listed languages are direct evidence of being multilingual/);
    expect(SYSTEM_PROMPT).toMatch(/"Team Captain" title is evidence of leadership/);
  });

  it("still preserves internship/interest/participation distinctions", () => {
    expect(SYSTEM_PROMPT).toMatch(/an internship is not automatically senior professional experience/);
    expect(SYSTEM_PROMPT).toMatch(/expressing interest in something is not the same as having experience in it/);
  });

  it("instructs the model to reason holistically from the goal description when no criteria list is supplied", () => {
    expect(SYSTEM_PROMPT).toMatch(/If no criteria list is provided.+reason directly from the Goal description text itself/);
  });
});
