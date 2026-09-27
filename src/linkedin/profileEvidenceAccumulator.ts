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

function compact(text: string | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// Durations like "7 mos" change monthly, so only the date range identifies an entry.
function dateRange(dates: string | undefined): string {
  return compact(dates?.split("·")[0]);
}

function agrees(a: string, b: string): boolean {
  return !a || !b || a === b;
}

// The same entry seen on two pages keeps, field by field, whichever text is longer.
function combine<T extends object>(a: T, b: T): T {
  const result = { ...a } as Record<string, unknown>;
  for (const [key, value] of Object.entries(b)) {
    const current = result[key];
    if (typeof value === "string" && (typeof current !== "string" || value.length > current.length)) result[key] = value;
  }
  return result as T;
}

function mergeBy<T extends object>(items: T[], same: (a: T, b: T) => boolean): T[] {
  const result: T[] = [];
  for (const item of items) {
    const at = result.findIndex((existing) => same(existing, item));
    if (at === -1) result.push(item);
    else result[at] = combine(result[at]!, item);
  }
  return result;
}

function sameExperience(a: ProfileExperienceEntry, b: ProfileExperienceEntry): boolean {
  if (!a.title || !b.title) return !a.title && !b.title && compact(a.description) === compact(b.description);
  return compact(a.title) === compact(b.title) && agrees(compact(a.company), compact(b.company)) && agrees(dateRange(a.dates), dateRange(b.dates));
}

function sameEducation(a: ProfileEducationEntry, b: ProfileEducationEntry): boolean {
  if (!a.school || !b.school) return !a.school && !b.school && compact(a.description) === compact(b.description);
  return compact(a.school) === compact(b.school) && agrees(compact(a.degree), compact(b.degree)) && agrees(dateRange(a.dates), dateRange(b.dates));
}

function mergeExperience(a: ProfileExperienceEntry[], b: ProfileExperienceEntry[]): ProfileExperienceEntry[] {
  return mergeBy([...a, ...b], sameExperience);
}

// Unstructured layouts yield one run-together "school" for the whole section. It adds nothing
// once structured entries cover the schools it mentions.
function isRunTogether(entry: ProfileEducationEntry, all: ProfileEducationEntry[]): boolean {
  if (!entry.school || entry.degree || entry.dates || entry.description) return false;
  const text = compact(entry.school);
  return all.some((other) => other !== entry && !!other.school && !!(other.degree || other.dates) && text.includes(compact(other.school)) && text !== compact(other.school));
}

function mergeEducation(a: ProfileEducationEntry[], b: ProfileEducationEntry[]): ProfileEducationEntry[] {
  const merged = mergeBy([...a, ...b], sameEducation);
  return merged.filter((entry) => !isRunTogether(entry, merged));
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

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

// Storage hands objects back with their keys reordered, so compare content, not key order.
export function sameEvidence(a: LinkedInProfile, b: LinkedInProfile): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
