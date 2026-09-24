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
