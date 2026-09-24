// A LinkedIn profile read from the currently-rendered page, never fetched or invented. Every
// field is optional, absent means "not visible right now," never "confirmed empty."

export interface ProfileExperienceEntry {
  title?: string;
  company?: string;
  description?: string;
}

export interface ProfileEducationEntry {
  school?: string;
  degree?: string;
  field?: string;
}

// A generic named/described entry, shared by the sections that all render as a simple list
// of "name + optional description" items.
export interface ProfileListEntry {
  name?: string;
  description?: string;
}

export type ProfileProjectEntry = ProfileListEntry;
export type ProfileCertificationEntry = ProfileListEntry;
export type ProfileOrganizationEntry = ProfileListEntry;
export type ProfileVolunteeringEntry = ProfileListEntry;
// name is the language itself, description its proficiency level when LinkedIn shows one.
export type ProfileLanguageEntry = ProfileListEntry;
export type ProfileHonorEntry = ProfileListEntry;

// Every section the adapter knows to look for, used only for progress display, never to
// demand a profile contain all of them. Excludes headline/location, which live in the top card.
export type ProfileSectionName =
  | "about"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "organizations"
  | "volunteering"
  | "languages"
  | "honors";

export const ALL_PROFILE_SECTIONS: ProfileSectionName[] = [
  "about",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "organizations",
  "volunteering",
  "languages",
  "honors",
];

export interface LinkedInProfile {
  name?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience: ProfileExperienceEntry[];
  education: ProfileEducationEntry[];
  skills: string[];
  projects: ProfileProjectEntry[];
  certifications: ProfileCertificationEntry[];
  organizations: ProfileOrganizationEntry[];
  volunteering: ProfileVolunteeringEntry[];
  languages: ProfileLanguageEntry[];
  honors: ProfileHonorEntry[];
  /** True once at least a name or headline was found, versus nothing readable at all. */
  extracted: boolean;
}

export const EMPTY_PROFILE: LinkedInProfile = {
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  organizations: [],
  volunteering: [],
  languages: [],
  honors: [],
  extracted: false,
};

// Which known sections actually have content right now. An absent section isn't missing
// information, some profiles genuinely have no Projects section.
export function foundSections(profile: LinkedInProfile): ProfileSectionName[] {
  const found: ProfileSectionName[] = [];
  if (profile.about) found.push("about");
  if (profile.experience.length > 0) found.push("experience");
  if (profile.education.length > 0) found.push("education");
  if (profile.skills.length > 0) found.push("skills");
  if (profile.projects.length > 0) found.push("projects");
  if (profile.certifications.length > 0) found.push("certifications");
  if (profile.organizations.length > 0) found.push("organizations");
  if (profile.volunteering.length > 0) found.push("volunteering");
  if (profile.languages.length > 0) found.push("languages");
  if (profile.honors.length > 0) found.push("honors");
  return found;
}

// Every text field matching is allowed to search, with a display label and the section it
// came from. The single source of truth for where evidence can come from.
export interface ProfileTextField {
  label: string;
  text: string;
  section: ProfileSectionName | "headline" | "location";
}

export function profileTextFields(profile: LinkedInProfile): ProfileTextField[] {
  const fields: ProfileTextField[] = [];
  if (profile.headline) fields.push({ label: "Headline", text: profile.headline, section: "headline" });
  if (profile.location) fields.push({ label: "Location", text: profile.location, section: "location" });
  if (profile.about) fields.push({ label: "About", text: profile.about, section: "about" });
  for (const entry of profile.experience) {
    const parts = [entry.title, entry.company, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        label: `Experience${entry.title ? `: ${entry.title}` : ""}`,
        text: parts.join(" — "),
        section: "experience",
      });
    }
  }
  for (const entry of profile.education) {
    const parts = [entry.school, entry.degree, entry.field].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        label: `Education${entry.school ? `: ${entry.school}` : ""}`,
        text: parts.join(" — "),
        section: "education",
      });
    }
  }
  if (profile.skills.length > 0) {
    fields.push({ label: "Skills", text: profile.skills.join(", "), section: "skills" });
  }
  for (const entry of profile.projects) {
    const parts = [entry.name, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({ label: `Project${entry.name ? `: ${entry.name}` : ""}`, text: parts.join(" — "), section: "projects" });
    }
  }
  for (const entry of profile.certifications) {
    const parts = [entry.name, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        label: `Certification${entry.name ? `: ${entry.name}` : ""}`,
        text: parts.join(" — "),
        section: "certifications",
      });
    }
  }
  for (const entry of profile.organizations) {
    const parts = [entry.name, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        label: `Organization${entry.name ? `: ${entry.name}` : ""}`,
        text: parts.join(" — "),
        section: "organizations",
      });
    }
  }
  for (const entry of profile.volunteering) {
    const parts = [entry.name, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        label: `Volunteering${entry.name ? `: ${entry.name}` : ""}`,
        text: parts.join(" — "),
        section: "volunteering",
      });
    }
  }
  for (const entry of profile.languages) {
    const parts = [entry.name, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({
        label: `Language${entry.name ? `: ${entry.name}` : ""}`,
        text: parts.join(" — "),
        section: "languages",
      });
    }
  }
  for (const entry of profile.honors) {
    const parts = [entry.name, entry.description].filter(Boolean);
    if (parts.length > 0) {
      fields.push({ label: `Honor${entry.name ? `: ${entry.name}` : ""}`, text: parts.join(" — "), section: "honors" });
    }
  }
  return fields;
}
