import { describe, expect, it } from "vitest";
import { scoreProfileAgainstGoal } from "./scoreProfile";
import { createCriterion, createGoal, type Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";

function makeProfile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
  return {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    organizations: [],
    volunteering: [],
    languages: [],
    extracted: true,
    ...overrides,
  };
}

function makeGoal(name: string, criteria: Goal["criteria"]): Goal {
  return { ...createGoal(name), criteria };
}

describe("scoreProfileAgainstGoal - basic scoring", () => {
  it("gives a full score when every criterion is met", () => {
    const goal = makeGoal("Test", [
      createCriterion("Python", "MUST_HAVE"),
      createCriterion("robotics", "PREFERRED"),
    ]);
    const profile = makeProfile({ about: "I write Python and build robotics systems." });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.scorePercent).toBe(100);
    expect(result.complete).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it("returns null when the goal has no scoreable criteria", () => {
    const goal = makeGoal("Empty", []);
    const profile = makeProfile({ about: "Anything" });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.scorePercent).toBeNull();
  });

  it("weighs MUST_HAVE more than PREFERRED, and PREFERRED more than OPTIONAL", () => {
    const goal = makeGoal("Weights", [
      createCriterion("Python", "MUST_HAVE"),
      createCriterion("Java", "PREFERRED"),
      createCriterion("Ruby", "OPTIONAL"),
    ]);
    // Only the OPTIONAL one is met, should score much lower than if only MUST_HAVE were met.
    const optionalOnly = scoreProfileAgainstGoal(goal, makeProfile({ about: "I use Ruby." }));
    const mustHaveOnly = scoreProfileAgainstGoal(goal, makeProfile({ about: "I use Python." }));
    expect(mustHaveOnly.scorePercent!).toBeGreaterThan(optionalOnly.scorePercent!);
  });
});

describe("scoreProfileAgainstGoal - unmet MUST_HAVE never reads as a confirmed failure", () => {
  it("caps but never zeroes the score when a MUST_HAVE is unconfirmed", () => {
    const goal = makeGoal("Test", [
      createCriterion("FRC mentor", "MUST_HAVE"),
      createCriterion("robotics", "PREFERRED"),
    ]);
    const profile = makeProfile({ about: "I build robotics systems." });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.scorePercent).not.toBe(0);
    expect(result.scorePercent).toBeLessThanOrEqual(60);
    expect(result.complete).toBe(false);
    expect(result.missing.some((m) => m.criterion.label === "FRC mentor")).toBe(true);
  });
});

describe("scoreProfileAgainstGoal - excluded criteria disqualify", () => {
  it("forces the score to 0 and marks disqualified when an excluded trait is found", () => {
    const goal = makeGoal("Test", [
      createCriterion("machine learning", "PREFERRED"),
      createCriterion("recruiter", "EXCLUDED"),
    ]);
    const profile = makeProfile({ headline: "Technical Recruiter", about: "I work in machine learning." });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.disqualified).toBe(true);
    expect(result.scorePercent).toBe(0);
  });

  it("does not disqualify when the excluded trait is merely unconfirmed", () => {
    const goal = makeGoal("Test", [
      createCriterion("machine learning", "PREFERRED"),
      createCriterion("recruiter", "EXCLUDED"),
    ]);
    const profile = makeProfile({ about: "I work in machine learning." });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.disqualified).toBe(false);
    expect(result.scorePercent).toBe(100);
  });
});

describe("scoreProfileAgainstGoal - the mission's own goal-change example", () => {
  const profile = makeProfile({
    headline: "Robotics Engineer",
    about: "I build autonomous robots and mentor students in general STEM projects.",
  });

  it("scores differently for FRC mentor vs AI collaborator on the SAME profile", () => {
    const frcGoal = makeGoal("FRC mentor", [createCriterion("FRC mentor", "MUST_HAVE")]);
    const aiGoal = makeGoal("AI collaborator", [createCriterion("machine learning", "MUST_HAVE")]);

    const frcResult = scoreProfileAgainstGoal(frcGoal, profile);
    const aiResult = scoreProfileAgainstGoal(aiGoal, profile);

    // Neither is confirmed, but they're independently evaluated, proving the score is
    // recomputed from the actual goal, not cached from a prior one.
    expect(frcResult.missing[0].criterion.label).toBe("FRC mentor");
    expect(aiResult.missing[0].criterion.label).toBe("machine learning");
  });

  it("does not give general robotics experience a high match when FRC mentorship is a Must Have", () => {
    const goal = makeGoal("FRC mentor", [createCriterion("FRC mentor", "MUST_HAVE")]);
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.scorePercent).toBeLessThanOrEqual(60);
    expect(result.reasons).toHaveLength(0);
  });
});

describe("scoreProfileAgainstGoal - determinism", () => {
  it("produces identical output across repeated calls with the same goal and profile", () => {
    const goal = makeGoal("Test", [
      createCriterion("Python", "MUST_HAVE"),
      createCriterion("robotics", "PREFERRED"),
      createCriterion("recruiter", "EXCLUDED"),
    ]);
    const profile = makeProfile({ about: "I write Python and build robotics systems." });
    const first = scoreProfileAgainstGoal(goal, profile);
    const second = scoreProfileAgainstGoal(goal, profile);
    expect(second).toEqual(first);
  });
});

describe("scoreProfileAgainstGoal - honest incomplete state", () => {
  it("reports an unextracted profile as incomplete rather than a misleading percentage", () => {
    const goal = makeGoal("Test", [createCriterion("Python", "MUST_HAVE")]);
    const profile: LinkedInProfile = {
      experience: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      organizations: [],
      volunteering: [],
      languages: [],
      extracted: false,
    };
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.profileExtracted).toBe(false);
    expect(result.complete).toBe(false);
  });
});

describe("scoreProfileAgainstGoal - a missing Must Have cannot be bought back by Optional matches", () => {
  it("keeps a Strong Match out of reach when the Must Have is unconfirmed, no matter how many Optionals hit", () => {
    const goal = makeGoal("Test", [
      createCriterion("FRC mentor", "MUST_HAVE"),
      createCriterion("Python", "OPTIONAL"),
      createCriterion("robotics", "OPTIONAL"),
      createCriterion("leadership", "OPTIONAL"),
      createCriterion("Charlotte", "OPTIONAL"),
    ]);
    const profile = makeProfile({
      about: "I write Python, build robotics systems, and led my school's robotics club.",
      location: "Charlotte, North Carolina",
    });
    const result = scoreProfileAgainstGoal(goal, profile);
    // Every Optional criterion is confirmed, but the Must Have never resolves to strong/moderate.
    // 55% of the weight is capped near 0, so 100% and 70%+ are both mathematically unreachable.
    expect(result.scorePercent).toBeLessThan(70);
    expect(result.complete).toBe(false);
  });
});

describe("scoreProfileAgainstGoal - multiple missing Must Haves make a Strong Match impossible", () => {
  it("keeps a Strong Match (70+) out of reach when two of two Must Haves are unconfirmed", () => {
    const goal = makeGoal("Test", [
      createCriterion("FRC mentor", "MUST_HAVE"),
      createCriterion("professional software experience", "MUST_HAVE"),
      createCriterion("Python", "OPTIONAL"),
    ]);
    const profile = makeProfile({ about: "I'm a student who enjoys coding in Python as a hobby." });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.scorePercent).toBeLessThan(70);
    expect(result.complete).toBe(false);
  });
});

describe("scoreProfileAgainstGoal - Excluded requires strong confirmed evidence to disqualify", () => {
  it("does not disqualify on merely moderate/weak evidence of the excluded trait", () => {
    const goal = makeGoal("Test", [
      createCriterion("engineering", "PREFERRED"),
      createCriterion("recruiter", "EXCLUDED"),
    ]);
    // "Talent Acquisition Specialist" is related to recruiting but not the literal word
    // "recruiter" or a pattern-matched role marker, at most weak/moderate evidence.
    const profile = makeProfile({ headline: "Talent Acquisition Specialist", about: "Background in engineering." });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.disqualified).toBe(false);
  });
});

describe("scoreProfileAgainstGoal - sparse profile reports low confidence, not a false precise score", () => {
  it("gives low confidence when only a headline has been read", () => {
    const goal = makeGoal("Test", [
      createCriterion("engineering background", "MUST_HAVE"),
      createCriterion("robotics", "PREFERRED"),
    ]);
    const profile = makeProfile({ headline: "Jordan Rivera" });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("gives high confidence when the full profile has been read", () => {
    const goal = makeGoal("Test", [
      createCriterion("engineering background", "MUST_HAVE"),
      createCriterion("robotics", "PREFERRED"),
    ]);
    const profile = makeProfile({
      education: [{ school: "Duke University", degree: "B.S. Mechanical Engineering" }],
      about: "I build robotics systems.",
    });
    const result = scoreProfileAgainstGoal(goal, profile);
    expect(result.confidence).toBe(1);
  });
});

describe("scoreProfileAgainstGoal - the exact same profile scores very differently under two different goals", () => {
  it("mirrors the mission's own worked example: high for one goal, low for an unrelated one", () => {
    const profile = makeProfile({
      headline: "AI Research Assistant",
      about: "I collaborate on machine learning research projects and love working with AI teams.",
      experience: [{ title: "AI Research Assistant", company: "State University Lab", description: "Full-time research on machine learning models." }],
      education: [{ school: "State University", degree: "B.S. Computer Science" }],
    });

    const aiGoal = makeGoal("AI collaborator", [
      createCriterion("machine learning", "MUST_HAVE"),
      createCriterion("AI", "PREFERRED"),
    ]);
    const frcGoal = makeGoal("FRC mentor", [
      createCriterion("FRC mentor", "MUST_HAVE"),
      createCriterion("robotics", "PREFERRED"),
    ]);

    const aiResult = scoreProfileAgainstGoal(aiGoal, profile);
    const frcResult = scoreProfileAgainstGoal(frcGoal, profile);

    expect(aiResult.scorePercent!).toBeGreaterThan(70);
    expect(frcResult.scorePercent!).toBeLessThan(40);
    expect(aiResult.scorePercent!).toBeGreaterThan(frcResult.scorePercent!);
  });
});

describe("scoreProfileAgainstGoal - changing the goal recalculates from the same evidence", () => {
  it("produces a different, correct score against a different goal without re-collecting the profile", () => {
    // The same profile object, collected once, mirrors the panel deriving the score fresh on
    // every render. Switching goals must never require rereading the LinkedIn page.
    const profile = makeProfile({ about: "I write Python and build robotics systems." });

    const goalA = makeGoal("Python roles", [createCriterion("Python", "MUST_HAVE")]);
    const resultA = scoreProfileAgainstGoal(goalA, profile);
    expect(resultA.scorePercent).toBe(100);

    const goalB = makeGoal("Java roles", [createCriterion("Java", "MUST_HAVE")]);
    const resultB = scoreProfileAgainstGoal(goalB, profile);
    expect(resultB.scorePercent).toBeLessThan(resultA.scorePercent!);
    expect(resultB.missing).toHaveLength(1);
    expect(resultB.missing[0].criterion.label).toBe("Java");
  });
});
