import { describe, expect, it } from "vitest";
import { mergeProfileEvidence } from "./profileEvidenceAccumulator";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";

function profile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
  return { ...EMPTY_PROFILE, extracted: true, ...overrides };
}

describe("mergeProfileEvidence - accumulates across sections, never replaces", () => {
  it("keeps everything from every prior section as new ones are merged in", () => {
    const main = profile({ name: "Illia Reviakin", headline: "Aspiring engineer", about: "Loves building things." });

    let accumulated = main;
    expect(accumulated.experience).toEqual([]);

    const experiencePage = profile({ experience: [{ title: "Intern", company: "Acme" }] });
    accumulated = mergeProfileEvidence(accumulated, experiencePage);
    expect(accumulated.name).toBe("Illia Reviakin");
    expect(accumulated.about).toBe("Loves building things.");
    expect(accumulated.experience).toEqual([{ title: "Intern", company: "Acme" }]);
    expect(accumulated.education).toEqual([]);

    const educationPage = profile({ education: [{ school: "State University" }] });
    accumulated = mergeProfileEvidence(accumulated, educationPage);
    expect(accumulated.experience).toEqual([{ title: "Intern", company: "Acme" }]); // still there
    expect(accumulated.education).toEqual([{ school: "State University" }]);

    const skillsPage = profile({ skills: ["Python", "React"] });
    accumulated = mergeProfileEvidence(accumulated, skillsPage);
    expect(accumulated.experience).toHaveLength(1);
    expect(accumulated.education).toHaveLength(1);
    expect(accumulated.skills).toEqual(["Python", "React"]);

    const honorsPage = profile({ honors: [{ name: "Dean's List" }] });
    accumulated = mergeProfileEvidence(accumulated, honorsPage);
    expect(accumulated.experience).toHaveLength(1);
    expect(accumulated.education).toHaveLength(1);
    expect(accumulated.skills).toEqual(["Python", "React"]);
    expect(accumulated.honors).toEqual([{ name: "Dean's List" }]);
    expect(accumulated.name).toBe("Illia Reviakin"); // identity preserved throughout
  });

  it("deduplicates the same experience entry appearing on both the main page and its detail page", () => {
    const main = profile({ experience: [{ title: "Intern", company: "Acme" }] });
    const detailsPage = profile({ experience: [{ title: "Intern", company: "Acme", description: "More detail here" }] });
    const merged = mergeProfileEvidence(main, detailsPage);
    expect(merged.experience).toHaveLength(1);
  });

  it("keeps untitled entries from different pages instead of treating them as duplicates", () => {
    const main = profile({ experience: [{ description: "Private Tutor — Completed 60+ hours of tutoring" }] });
    const details = profile({ experience: [{ description: "Video Editor — Created videos featuring 80+ children" }] });
    expect(mergeProfileEvidence(main, details).experience).toHaveLength(2);
    expect(mergeProfileEvidence(main, main).experience).toHaveLength(1);
  });

  it("keeps the richer copy when the same entry appears on the main page and its detail page", () => {
    const main = profile({ honors: [{ name: "2nd Place - Webmaster", description: "Issued by TSA" }] });
    const details = profile({ honors: [{ name: "2nd Place - Webmaster", description: "Issued by TSA · Earned 2nd place at regionals" }] });
    expect(mergeProfileEvidence(main, details).honors).toEqual(details.honors);
    expect(mergeProfileEvidence(details, main).honors).toEqual(details.honors);
  });

  it("deduplicates list entries (projects, certifications, etc.) by name", () => {
    const main = profile({ projects: [{ name: "Cool App" }] });
    const detailsPage = profile({ projects: [{ name: "Cool App" }, { name: "Second Project" }] });
    const merged = mergeProfileEvidence(main, detailsPage);
    expect(merged.projects).toEqual([{ name: "Cool App" }, { name: "Second Project" }]);
  });

  it("deduplicates skills case-insensitively", () => {
    const main = profile({ skills: ["python"] });
    const detailsPage = profile({ skills: ["Python", "React"] });
    const merged = mergeProfileEvidence(main, detailsPage);
    expect(merged.skills).toEqual(["python", "React"]);
  });

  it("never lets a later section's missing identity fields erase already-accumulated ones", () => {
    const main = profile({ name: "Illia", headline: "Engineer" });
    const detailsPage = profile({ name: undefined, headline: undefined, experience: [{ title: "Intern" }] });
    const merged = mergeProfileEvidence(main, detailsPage);
    expect(merged.name).toBe("Illia");
    expect(merged.headline).toBe("Engineer");
  });
});

describe("mergeProfileEvidence - one record per real education or role", () => {
  const detailSchool = {
    school: "State Academy",
    degree: "Higher National Diploma, Software Engineering",
    dates: "2016 – 2025",
    description: "Studied C++ for 9 years and built full-stack projects",
  };

  it("merges the main page and detail page copies of a school into one record", () => {
    const main = profile({ education: [{ school: "State Academy", degree: "Higher National Diploma, Software Engineering", dates: "2016 – 2025", description: "Studied C++ for 9 years" }] });
    const details = profile({ education: [detailSchool, { school: "City High School", degree: "Computer Engineering" }] });
    expect(mergeProfileEvidence(main, details).education).toEqual([detailSchool, { school: "City High School", degree: "Computer Engineering" }]);
  });

  it("combines fields so neither copy's extra details are lost", () => {
    const main = profile({ education: [{ school: "State Academy", dates: "2016 – 2025", description: "Studied C++ for 9 years" }] });
    const details = profile({ education: [{ school: "State Academy", degree: "Higher National Diploma" }] });
    expect(mergeProfileEvidence(main, details).education).toEqual([{ school: "State Academy", degree: "Higher National Diploma", dates: "2016 – 2025", description: "Studied C++ for 9 years" }]);
  });

  it("drops a run-together blob once structured entries cover it", () => {
    const main = profile({ education: [{ school: "State AcademyHigher National Diploma, Software Engineering2016 – 2025Studied C++" }] });
    const details = profile({ education: [detailSchool] });
    expect(mergeProfileEvidence(main, details).education).toEqual([detailSchool]);
  });

  it("keeps two degrees from the same school apart", () => {
    const merged = mergeProfileEvidence(profile({ education: [{ school: "State University", degree: "BS" }] }), profile({ education: [{ school: "State University", degree: "MS" }] }));
    expect(merged.education).toHaveLength(2);
  });

  it("treats a role whose duration ticked over as the same role", () => {
    const before = profile({ experience: [{ title: "Web Lead", company: "Robotics Club", dates: "Mar 2026 - Present · 7 mos" }] });
    const after = profile({ experience: [{ title: "Web Lead", company: "Robotics Club", dates: "Mar 2026 - Present · 8 mos" }] });
    expect(mergeProfileEvidence(before, after).experience).toHaveLength(1);
  });

  it("is stable when the same evidence is merged again", () => {
    const details = profile({ education: [detailSchool], experience: [{ title: "Web Lead", company: "Robotics Club", dates: "2026" }] });
    const once = mergeProfileEvidence(profile({}), details);
    expect(mergeProfileEvidence(once, details)).toEqual(once);
  });
});
