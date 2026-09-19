// Regression coverage for scenarios the old keyword-only matcher got wrong, and the new
// hybrid concept-based matcher must get right.
import { describe, expect, it } from "vitest";
import { evaluateCriterion } from "./semanticMatcher";
import { buildProfileEvidence } from "../evidence/buildProfileEvidence";
import { createCriterion } from "../models/goal";
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

function evaluate(criterionLabel: string, p: LinkedInProfile) {
  const evidence = buildProfileEvidence(p);
  return evaluateCriterion(createCriterion(criterionLabel, "MUST_HAVE"), p, evidence);
}

describe("semanticMatcher - engineering background vs a specific engineering degree", () => {
  it("treats a Mechanical Engineering degree as strong evidence for 'engineering background', despite no literal word overlap", () => {
    const p = profile({ education: [{ school: "Duke University", degree: "B.S. Mechanical Engineering" }] });
    const result = evaluate("engineering background", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - FRC mentor vs robotics club member", () => {
  it("gives at most weak evidence for 'FRC mentor' when the profile only shows club membership", () => {
    const p = profile({ organizations: [{ name: "Robotics Club", description: "Member" }] });
    const result = evaluate("FRC mentor", p);
    expect(result.strength).toBe("weak");
    expect(result.strength).not.toBe("strong");
    expect(result.strength).not.toBe("moderate");
  });

  it("gives strong evidence for 'FRC mentor' when the profile shows actual mentoring language", () => {
    const p = profile({ experience: [{ title: "FRC Mentor", company: "Team 1234" }] });
    const result = evaluate("FRC mentor", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - mentor vs participant", () => {
  it("does not let plain participation satisfy a bare 'mentor' criterion", () => {
    const p = profile({ volunteering: [{ name: "Summer Camp", description: "Participant" }] });
    const result = evaluate("mentor", p);
    expect(result.strength).not.toBe("strong");
    expect(result.strength).not.toBe("moderate");
  });

  it("recognizes real mentoring language for a bare 'mentor' criterion", () => {
    const p = profile({ volunteering: [{ name: "Summer Camp", description: "Mentored 10 students" }] });
    const result = evaluate("mentor", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - software engineer vs CS student", () => {
  it("gives moderate (not strong, not missing) evidence for a CS student against a 'software engineer' criterion", () => {
    const p = profile({ headline: "Computer Science Student at State University" });
    const result = evaluate("software engineer", p);
    expect(result.strength).toBe("moderate");
  });

  it("gives strong evidence when the profile shows an actual software engineering job", () => {
    const p = profile({ experience: [{ title: "Software Engineer", company: "Acme Corp" }] });
    const result = evaluate("software engineer", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - leadership vs ordinary organization membership", () => {
  it("does not let plain membership satisfy a 'leadership' criterion", () => {
    const p = profile({ organizations: [{ name: "Chess Club", description: "Member" }] });
    const result = evaluate("leadership", p);
    expect(result.strength).not.toBe("strong");
    expect(result.strength).not.toBe("moderate");
  });

  it("recognizes an actual leadership title", () => {
    const p = profile({ organizations: [{ name: "Chess Club", description: "President" }] });
    const result = evaluate("leadership", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - professional experience vs a school project", () => {
  it("never treats a school project as strong evidence of professional experience", () => {
    const p = profile({ projects: [{ name: "Class Project", description: "Built a web app for a course assignment" }] });
    const result = evaluate("professional experience", p);
    expect(result.strength).not.toBe("strong");
  });

  it("recognizes a real job as strong evidence of professional experience", () => {
    const p = profile({ experience: [{ title: "Software Engineer", company: "Acme Corp", description: "Full-time" }] });
    const result = evaluate("professional experience", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - multilingual vs explicit multiple languages", () => {
  it("gives strong evidence when two or more languages are listed", () => {
    const p = profile({ languages: [{ name: "English", description: "Native" }, { name: "Spanish", description: "Professional" }] });
    const result = evaluate("multilingual", p);
    expect(result.strength).toBe("strong");
  });

  it("does not confirm multilingual from a single listed language", () => {
    const p = profile({ languages: [{ name: "English", description: "Native" }] });
    const result = evaluate("multilingual", p);
    expect(result.strength).not.toBe("strong");
  });

  it("reports unknown, not missing, when the Languages section hasn't loaded on an otherwise sparse profile", () => {
    const p = profile({ headline: "Software Engineer" }); // extracted, but no core sections read yet
    const result = evaluate("multilingual", p);
    expect(result.strength).toBe("unknown");
  });
});

describe("semanticMatcher - sparse profiles report unknown, not a confirmed failure", () => {
  it("reports unknown for a domain criterion when only the headline has been read so far", () => {
    const p = profile({ headline: "Jordan Rivera" });
    const result = evaluate("engineering background", p);
    expect(result.strength).toBe("unknown");
  });

  it("reports missing, not unknown, once a real chunk of the profile has been read and still shows nothing relevant", () => {
    const p = profile({
      about: "I enjoy hiking and photography.",
      experience: [{ title: "Marketing Coordinator", company: "Acme" }],
      education: [{ school: "State University", degree: "B.A. Communications" }],
    });
    const result = evaluate("engineering background", p);
    expect(result.strength).toBe("missing");
  });
});

describe("semanticMatcher - literal fallback still works for criteria with no concept meaning", () => {
  it("matches a specific technology exactly", () => {
    const p = profile({ skills: ["Python", "React"] });
    const result = evaluate("Python", p);
    expect(result.strength).toBe("strong");
  });

  it("matches a location exactly", () => {
    const p = profile({ location: "Charlotte, North Carolina" });
    const result = evaluate("Charlotte", p);
    expect(result.strength).toBe("strong");
  });
});

describe("semanticMatcher - literal fallback reports unknown, not missing, before any core section has loaded", () => {
  it("does not declare a literal criterion confirmed-absent from a location-only profile (confirmed live on a real sparse profile)", () => {
    // A profile with only name and location loaded still had "Microsoft" confidently marked
    // "missing", presenting an unread profile as a checked-and-absent one.
    const p = profile({ location: "Example City, Example State, United States" });
    const result = evaluate("Microsoft", p);
    expect(result.strength).toBe("unknown");
  });

  it("still reports missing once a real chunk of the profile has loaded and shows nothing relevant", () => {
    const p = profile({ about: "I enjoy hiking and photography.", location: "Example City, Example State, United States" });
    const result = evaluate("Microsoft", p);
    expect(result.strength).toBe("missing");
  });
});

describe("semanticMatcher - determinism", () => {
  it("produces identical output across repeated calls with the same inputs", () => {
    const p = profile({ education: [{ school: "Duke", degree: "B.S. Mechanical Engineering" }] });
    const first = evaluate("engineering background", p);
    const second = evaluate("engineering background", p);
    expect(second).toEqual(first);
  });
});
