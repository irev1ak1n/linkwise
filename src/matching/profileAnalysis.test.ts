import { describe, expect, it } from "vitest";
import { assessExperienceLevel, buildProfileAnalysis } from "./profileAnalysis";
import { scoreProfileAgainstGoal } from "./scoreProfile";
import { buildProfileEvidence } from "../evidence/buildProfileEvidence";
import { createCriterion, createGoal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";

function profile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
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

describe("assessExperienceLevel", () => {
  it("reports limited for a nearly empty profile", () => {
    const evidence = buildProfileEvidence(profile({ headline: "Jordan Rivera" }));
    expect(assessExperienceLevel(evidence)).toBe("limited");
  });

  it("reports developing for a student with only education/projects, no jobs", () => {
    const evidence = buildProfileEvidence(
      profile({ education: [{ school: "Duke", degree: "B.S. Mechanical Engineering" }], projects: [{ name: "Robot Arm", description: "Built a 3-axis robotic arm for a class project." }] }),
    );
    expect(assessExperienceLevel(evidence)).toBe("developing");
  });

  it("reports relevant for exactly one real professional role", () => {
    const evidence = buildProfileEvidence(profile({ experience: [{ title: "Software Engineer", company: "Acme Corp" }] }));
    expect(assessExperienceLevel(evidence)).toBe("relevant");
  });

  it("reports strong for two real professional roles", () => {
    const evidence = buildProfileEvidence(
      profile({
        experience: [
          { title: "Software Engineer", company: "Acme Corp" },
          { title: "Backend Developer", company: "Beta Inc" },
        ],
      }),
    );
    expect(assessExperienceLevel(evidence)).toBe("strong");
  });

  it("reports extensive for three real professional roles", () => {
    const evidence = buildProfileEvidence(
      profile({
        experience: [
          { title: "Software Engineer", company: "Acme Corp" },
          { title: "Backend Developer", company: "Beta Inc" },
          { title: "Founder", company: "Gamma LLC" },
        ],
      }),
    );
    expect(assessExperienceLevel(evidence)).toBe("extensive");
  });

  it("never reads an internship as full career-level experience (confirmed live on a real profile)", () => {
    // A student with an internship and two other part-time roles read as "Extensive
    // experience" before this fix. The internship distinction should count for something.
    const evidence = buildProfileEvidence(
      profile({
        experience: [
          { title: "Teaching Assistant", company: "State University Engineering Department", description: "Part-time" },
          { title: "Design Intern", company: "Example Manufacturing Co.", description: "Internship" },
          { title: "Lifeguard", company: "City Parks Department", description: "Part-time" },
        ],
      }),
    );
    expect(assessExperienceLevel(evidence)).not.toBe("extensive");
  });

  it("never varies based on anything but evidence — same inputs, same output", () => {
    const evidence = buildProfileEvidence(profile({ experience: [{ title: "Software Engineer", company: "Acme Corp" }] }));
    expect(assessExperienceLevel(evidence)).toBe(assessExperienceLevel(evidence));
  });
});

describe("buildProfileAnalysis", () => {
  it("never presents the analysis as a judgment of the person, only of goal relevance", () => {
    const goal = { ...createGoal("FRC mentor"), criteria: [createCriterion("FRC mentor", "MUST_HAVE")] };
    const p = profile({ about: "I enjoy hiking." });
    const result = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);
    const analysis = buildProfileAnalysis(goal, p, result, evidence);
    expect(analysis.recommendation.reason.toLowerCase()).toContain("frc mentor");
  });

  it("surfaces a missing Must Have as a gap with a 'not confirmed' style label", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("FRC mentor", "MUST_HAVE")] };
    const p = profile({ about: "I enjoy hiking and reading.", experience: [{ title: "Marketing Coordinator", company: "Acme" }] });
    const result = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);
    const analysis = buildProfileAnalysis(goal, p, result, evidence);
    expect(analysis.gaps.some((g) => g.label.includes("FRC mentor") && g.label.includes("not confirmed"))).toBe(true);
  });

  it("gives a strong-candidate recommendation for a well-supported complete match", () => {
    const goal = {
      ...createGoal("Robotics mentor"),
      criteria: [createCriterion("mentor", "MUST_HAVE"), createCriterion("robotics", "PREFERRED")],
    };
    const p = profile({ experience: [{ title: "FRC Mentor", company: "Team 1234", description: "Mentored a robotics team for 3 years." }] });
    const result = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);
    const analysis = buildProfileAnalysis(goal, p, result, evidence);
    expect(analysis.recommendation.label).toBe("Strong candidate — worth contacting");
  });

  it("recommends investigating further rather than a confident verdict on a sparse profile", () => {
    const goal = { ...createGoal("Test"), criteria: [createCriterion("engineering background", "MUST_HAVE")] };
    const p = profile({ headline: "Jordan Rivera" });
    const result = scoreProfileAgainstGoal(goal, p);
    const evidence = buildProfileEvidence(p);
    const analysis = buildProfileAnalysis(goal, p, result, evidence);
    expect(analysis.recommendation.label).toBe("Consider / investigate further");
  });
});
