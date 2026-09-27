const SECTION_LABELS: Record<string, string> = {
  about: "About",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  projects: "Projects",
  certifications: "Licenses & certifications",
  organizations: "Organizations",
  volunteering: "Volunteering",
  languages: "Languages",
  honors: "Honors & awards",
};

export function sectionLabel(section: string | null | undefined): string | null {
  return section ? (SECTION_LABELS[section] ?? null) : null;
}
