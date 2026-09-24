// Merges a newly-visited section's extracted profile into the person's running accumulated
// profile. A "/details/{section}/" page only ever shows one section, so this never replaces
// the accumulated profile with what's on the current page, only adds to it.
import type {
  LinkedInProfile,
  ProfileEducationEntry,
  ProfileExperienceEntry,
  ProfileListEntry,
} from "../models/profile";

function normalize(text: string | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    result.push(item);
  }
  return result;
}

function mergeExperience(a: ProfileExperienceEntry[], b: ProfileExperienceEntry[]): ProfileExperienceEntry[] {
  return dedupeBy([...a, ...b], (e) => `${normalize(e.title)}|${normalize(e.company)}`);
}

function mergeEducation(a: ProfileEducationEntry[], b: ProfileEducationEntry[]): ProfileEducationEntry[] {
  return dedupeBy([...a, ...b], (e) => `${normalize(e.school)}|${normalize(e.degree)}`);
}

function mergeListEntries(a: ProfileListEntry[], b: ProfileListEntry[]): ProfileListEntry[] {
  return dedupeBy([...a, ...b], (e) => normalize(e.name) || normalize(e.description));
}

function mergeSkills(a: string[], b: string[]): string[] {
  return dedupeBy([...a, ...b], (s) => normalize(s));
}

// Identity fields keep whichever value was already accumulated, since the main profile page
// is the only place they ever come from and every later section pass leaves them undefined.
export function mergeProfileEvidence(accumulated: LinkedInProfile, incoming: LinkedInProfile): LinkedInProfile {
  return {
    name: accumulated.name ?? incoming.name,
    headline: accumulated.headline ?? incoming.headline,
    location: accumulated.location ?? incoming.location,
    about: accumulated.about ?? incoming.about,
    experience: mergeExperience(accumulated.experience, incoming.experience),
    education: mergeEducation(accumulated.education, incoming.education),
    skills: mergeSkills(accumulated.skills, incoming.skills),
    projects: mergeListEntries(accumulated.projects, incoming.projects),
    certifications: mergeListEntries(accumulated.certifications, incoming.certifications),
    organizations: mergeListEntries(accumulated.organizations, incoming.organizations),
    volunteering: mergeListEntries(accumulated.volunteering, incoming.volunteering),
    languages: mergeListEntries(accumulated.languages, incoming.languages),
    honors: mergeListEntries(accumulated.honors, incoming.honors),
    extracted: accumulated.extracted || incoming.extracted,
  };
}
