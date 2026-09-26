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

// A duplicate keeps whichever copy carries more text, e.g. a detail page's full description
// over the main page's clamped one.
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const index = new Map<string, number>();
  const result: T[] = [];
  for (const item of items) {
    const k = key(item);
    const at = k ? index.get(k) : undefined;
    if (at === undefined) {
      if (k) index.set(k, result.length);
      result.push(item);
    } else if (JSON.stringify(item).length > JSON.stringify(result[at]).length) {
      result[at] = item;
    }
  }
  return result;
}

function mergeExperience(a: ProfileExperienceEntry[], b: ProfileExperienceEntry[]): ProfileExperienceEntry[] {
  return dedupeBy([...a, ...b], (e) => (e.title || e.company ? `${normalize(e.title)}|${normalize(e.company)}` : normalize(e.description)));
}

function mergeEducation(a: ProfileEducationEntry[], b: ProfileEducationEntry[]): ProfileEducationEntry[] {
  return dedupeBy([...a, ...b], (e) => (e.school || e.degree ? `${normalize(e.school)}|${normalize(e.degree)}` : normalize(e.field)));
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
