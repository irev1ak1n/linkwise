import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { diffProfiles } from "./profileDiff";
import type { ChangeSection } from "./types";

const ALL: ChangeSection[] = ["headline", "about", "experience", "education", "skills", "projects", "certifications", "organizations", "volunteering", "languages", "honors"];

const base: LinkedInProfile = {
  ...EMPTY_PROFILE,
  name: "Jordan Rivera",
  headline: "Software engineering student",
  experience: [
    { title: "Software Engineer", company: "Acme", dates: "Jan 2026 - Present · 8 mos", description: "Built a website serving 300+ students" },
    { title: "Tutor", company: "Code Club", dates: "2024 - 2025", description: "Taught Python" },
  ],
  education: [{ school: "Westfield High", degree: "High School Diploma", dates: "2022 - 2026" }],
  certifications: [{ name: "AWS Certified Cloud Practitioner" }],
  skills: ["Python", "React", "SQL"],
  languages: [{ name: "English", description: "Native or bilingual proficiency" }, { name: "Spanish", description: "Limited working proficiency" }],
  extracted: true,
};

const full = { baselineComplete: ALL, currentComplete: ALL };

function diff(current: LinkedInProfile, options = full) {
  return diffProfiles(base, current, options);
}

describe("diffProfiles", () => {
  it("finds nothing in an unchanged profile, even reordered and a month older", () => {
    const result = diff({
      ...base,
      experience: [base.experience[1]!, { ...base.experience[0]!, dates: "Jan 2026 - Present · 9 mos" }],
      skills: ["SQL", "Python", "React"],
      languages: [...base.languages].reverse(),
    });
    expect(result.changes).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it("sends a paraphrase to the semantic check instead of calling it a change (test A)", () => {
    const result = diff({ ...base, experience: [{ ...base.experience[0]!, description: "Designed a website used by more than 300 students" }, base.experience[1]!] });
    expect(result.changes).toEqual([]);
    expect(result.pending).toMatchObject([{ section: "experience", context: "Software Engineer at Acme", previous: "Built a website serving 300+ students" }]);
  });

  it("reports a large metric change as major and improved (test B)", () => {
    const result = diff({ ...base, experience: [{ ...base.experience[0]!, description: "Built a website serving 1,000+ students" }, base.experience[1]!] });
    expect(result.changes).toMatchObject([{ kind: "metric_changed", significance: "major", direction: "improved", previous: "300+ students", current: "1,000+ students" }]);
    expect(result.pending).toEqual([]);
  });

  it("asks about a longer description with new detail (test C)", () => {
    const current = { ...base, experience: [{ ...base.experience[0]!, description: "Built a website serving 300+ students and a staff dashboard allowing advisers to manage student content" }, base.experience[1]!] };
    expect(diff(current).pending).toHaveLength(1);
  });

  it("reads a new sentence with numbers as one wording change, not a row per number", () => {
    const current = { ...base, experience: [base.experience[0]!, { ...base.experience[1]!, description: "Taught Python. Tutored 15+ peers through 150+ hours over 1.5 years, ages 4" }] };
    const result = diff(current);
    expect(result.changes).toEqual([]);
    expect(result.pending).toHaveLength(1);
  });

  it("reports a new certification as meaningful and improved (test E)", () => {
    const result = diff({ ...base, certifications: [...base.certifications, { name: "Google Data Analytics Certificate" }] });
    expect(result.changes).toMatchObject([{ kind: "added", section: "certifications", title: "New certification", subject: "Google Data Analytics Certificate", significance: "meaningful", direction: "improved" }]);
  });

  it("reports a changed role at the same company as changed, not improved (test F)", () => {
    const result = diff({ ...base, experience: [{ ...base.experience[0]!, title: "Product Manager" }, base.experience[1]!] });
    expect(result.changes).toMatchObject([{ kind: "role_changed", significance: "major", direction: "changed", previous: "Software Engineer", current: "Product Manager" }]);
  });

  it("reports a removed certification as potentially weaker (test G)", () => {
    const result = diff({ ...base, certifications: [] });
    expect(result.changes).toMatchObject([{ kind: "removed", section: "certifications", direction: "weaker", significance: "meaningful" }]);
  });

  it("reads member to captain as a new leadership role", () => {
    const result = diff({ ...base, experience: [base.experience[0]!, { ...base.experience[1]!, title: "Team Lead" }] });
    expect(result.changes).toMatchObject([{ kind: "role_changed", title: "Now in a leadership role", direction: "improved" }]);
  });

  it("reports new jobs, ended roles, new skills and language levels", () => {
    const result = diff({
      ...base,
      experience: [{ ...base.experience[0]!, dates: "Jan 2026 - Sep 2026 · 9 mos" }, base.experience[1]!, { title: "Software Engineering Intern", company: "Initech", dates: "Oct 2026 - Present" }],
      skills: [...base.skills, "TypeScript"],
      languages: [base.languages[0]!, { name: "Spanish", description: "Professional working proficiency" }],
    });
    expect(result.changes.map((c) => [c.kind, c.title])).toEqual([
      ["role_ended", "Role ended"],
      ["added", "New internship"],
      ["proficiency_changed", "Language proficiency changed"],
      ["added", "New skills"],
    ]);
    expect(result.changes.find((c) => c.kind === "proficiency_changed")!.direction).toBe("improved");
  });

  it("never reports entries as removed when the current page has not shown the whole section", () => {
    const mainPageOnly = { ...base, experience: [base.experience[0]!], certifications: [], skills: ["Python"] };
    const result = diff(mainPageOnly, { baselineComplete: ALL, currentComplete: ["headline"] });
    expect(result.changes).toEqual([]);
    const next = result.nextSnapshot(new Set());
    expect(next.experience).toHaveLength(2);
    expect(next.certifications).toHaveLength(1);
    expect(next.skills.sort()).toEqual(["Python", "React", "SQL"]);
  });

  it("never reports entries as added when the baseline had not seen the whole section", () => {
    const result = diff({ ...base, certifications: [...base.certifications, { name: "Older certificate" }] }, { baselineComplete: ["headline"], currentComplete: ALL });
    expect(result.changes).toEqual([]);
    expect(result.nextSnapshot(new Set()).certifications).toHaveLength(2);
  });

  it("keeps the previous wording for an edit that could not be checked", () => {
    const current = { ...base, experience: [{ ...base.experience[0]!, description: "Designed a website used by more than 300 students" }, base.experience[1]!] };
    const result = diff(current);
    expect(result.nextSnapshot(new Set([result.pending[0]!.id])).experience[0]!.description).toBe("Built a website serving 300+ students");
    expect(result.nextSnapshot(new Set()).experience[0]!.description).toBe("Designed a website used by more than 300 students");
  });

  it("keeps the fuller description when the page only shows a clamped copy", () => {
    const fuller = { ...base, experience: [{ ...base.experience[0]!, description: "Built a website serving 300+ students and trained the staff" }, base.experience[1]!] };
    const clamped = { ...fuller, experience: [{ ...fuller.experience[0]!, description: "Built a website serving 300+ students" }, base.experience[1]!] };
    const result = diffProfiles(fuller, clamped, full);
    expect(result.changes).toEqual([]);
    expect(result.nextSnapshot(new Set()).experience[0]!.description).toBe("Built a website serving 300+ students and trained the staff");
  });
});
