// Layer 1: a deterministic, structural comparison of two evidence snapshots. Entries are paired
// by identity (role + company + start date, school, name), so reordering never reads as a change.
// Wording edits it cannot judge on its own are returned as pending pairs for the semantic check.
//
// A section only counts as fully seen when every entry was visible. Entries can only be "added"
// against a baseline that saw the whole section, and "removed" when the current page does, so a
// revisit that reads only the main page never invents changes.
import type { LinkedInProfile, ProfileEducationEntry, ProfileExperienceEntry, ProfileListEntry } from "../models/profile";
import { normalizeText } from "../matching/textNormalize";
import { canonicalText, compareText, similarity, type MetricDifference, type TextVerdict } from "./textCompare";
import type { ChangeDirection, ChangeKind, ChangeSection, ChangeSignificance, ProfileChange } from "./types";

export interface TextPair {
  id: string;
  section: ChangeSection;
  context: string;
  previous: string;
  current: string;
}

export interface DiffOptions {
  baselineComplete: ChangeSection[];
  currentComplete: ChangeSection[];
}

export interface ProfileDiff {
  changes: ProfileChange[];
  pending: TextPair[];
  /** The next snapshot: current evidence plus everything not confirmed gone. Pending pairs listed
   * in unresolved keep their previous text, so they are compared again next time. */
  nextSnapshot(unresolved: ReadonlySet<string>): LinkedInProfile;
}

// "Manager" is left out: "Product Manager" names a function, not a promotion.
const LEADER = /\b(lead|leader|captain|president|head|director|founder|co-founder|chair|chairman|chief)\b/i;
const INTERN = /\bintern(ship)?\b/i;

const LIST_SECTIONS = ["projects", "certifications", "organizations", "volunteering", "honors", "languages"] as const;
type ListSection = (typeof LIST_SECTIONS)[number];

const ADDED_TITLE: Record<ListSection | "education" | "skills", string> = {
  projects: "New project",
  certifications: "New certification",
  organizations: "New organization",
  volunteering: "New volunteer role",
  honors: "New award",
  languages: "New language",
  education: "New education",
  skills: "New skills",
};

const REMOVED_TITLE: Record<ListSection | "education" | "skills" | "experience", string> = {
  projects: "Project removed",
  certifications: "Certification removed",
  organizations: "Organization removed",
  volunteering: "Volunteer role removed",
  honors: "Award removed",
  languages: "Language removed",
  education: "Education no longer listed",
  skills: "Skills no longer listed",
  experience: "Role no longer listed",
};

const PROFICIENCY = ["elementary", "limited working", "professional working", "full professional", "native or bilingual"];

function proficiencyRank(text: string | undefined): number {
  const normalized = normalizeText(text ?? "");
  return PROFICIENCY.findIndex((level) => normalized.includes(level));
}

function key(text: string): string {
  return canonicalText(text).slice(0, 60);
}

function change(
  section: ChangeSection,
  kind: ChangeKind,
  subject: string,
  title: string,
  significance: ChangeSignificance,
  direction: ChangeDirection,
  extra: Partial<ProfileChange> = {},
): ProfileChange {
  return { id: `${section}:${kind}:${key(subject)}`, kind, section, significance, direction, title, subject, ...extra };
}

function dateRange(dates: string | undefined): { start: string; end: string } {
  const [range = ""] = (dates ?? "").split("·");
  const [start = "", end = ""] = range.split(/\s+[-–—]\s+|\s+to\s+/);
  return { start: normalizeText(start), end: normalizeText(end) };
}

function experienceLabel(entry: ProfileExperienceEntry): string {
  return [entry.title, entry.company].filter(Boolean).join(" at ") || entry.description?.slice(0, 60) || "Experience entry";
}

function educationLabel(entry: ProfileEducationEntry): string {
  return [entry.school, entry.degree].filter(Boolean).join(" — ") || "Education entry";
}

function listLabel(entry: ProfileListEntry): string {
  return entry.name ?? entry.description?.slice(0, 60) ?? "Entry";
}

// The longer copy of each text field, for an entry both sides agree on.
function richer<T extends object>(previous: T, current: T): T {
  const result = { ...previous } as Record<string, unknown>;
  for (const [field, value] of Object.entries(current)) {
    const old = result[field];
    if (typeof value === "string" && (typeof old !== "string" || value.length >= old.length)) result[field] = value;
  }
  return result as T;
}

interface Pair<T> {
  previous: T;
  current: T;
}

function pairUp<T>(previous: T[], current: T[], matchers: ((a: T, b: T) => boolean)[]): { pairs: Pair<T>[]; added: T[]; removed: T[]; byMatcher: Map<Pair<T>, number> } {
  const leftPrevious = [...previous];
  const leftCurrent = [...current];
  const pairs: Pair<T>[] = [];
  const byMatcher = new Map<Pair<T>, number>();
  matchers.forEach((same, level) => {
    for (const entry of [...leftCurrent]) {
      const at = leftPrevious.findIndex((old) => same(old, entry));
      if (at === -1) continue;
      const pair = { previous: leftPrevious.splice(at, 1)[0]!, current: entry };
      pairs.push(pair);
      byMatcher.set(pair, level);
      leftCurrent.splice(leftCurrent.indexOf(entry), 1);
    }
  });
  return { pairs, added: leftCurrent, removed: leftPrevious, byMatcher };
}

export function diffProfiles(baseline: LinkedInProfile, current: LinkedInProfile, options: DiffOptions): ProfileDiff {
  const changes: ProfileChange[] = [];
  const pending: TextPair[] = [];
  const canAdd = (section: ChangeSection) => options.baselineComplete.includes(section);
  const canRemove = (section: ChangeSection) => options.currentComplete.includes(section);

  // A description or other free text on an entry both snapshots have.
  function compareField(section: ChangeSection, context: string, previous: string | undefined, current: string | undefined): TextVerdict {
    const verdict = compareText(previous, current);
    if (verdict.verdict === "same") return verdict;
    // A longer copy of text the baseline only saw clamped is not new information.
    if (verdict.verdict === "extended" && !canAdd(section)) return verdict;
    const wordingChanged = verdict.verdict === "extended" || verdict.wordingChanged;
    for (const metric of verdict.metrics) {
      // A number that only appears on one side belongs to wording the semantic check reads whole.
      const unpaired = !metric.previous || !metric.current;
      if (unpaired && (wordingChanged || !(metric.previous ?? metric.current)!.unit)) continue;
      changes.push(metricChange(section, context, metric));
    }
    if (wordingChanged) pending.push({ id: `${section}:text_changed:${key(context)}`, section, context, previous: previous ?? "", current: current ?? "" });
    return verdict;
  }

  const fieldVerdicts = new Map<string, TextVerdict>();
  for (const field of ["headline", "about"] as const) {
    if (!current[field] || !baseline[field]) continue;
    fieldVerdicts.set(field, compareField(field, field === "headline" ? "Headline" : "About", baseline[field], current[field]));
  }

  const experience = pairUp(baseline.experience, current.experience, [
    (a, b) => key(a.title ?? "") === key(b.title ?? "") && key(a.company ?? "") === key(b.company ?? "") && agrees(dateRange(a.dates).start, dateRange(b.dates).start),
    (a, b) => !!a.company && key(a.company) === key(b.company ?? "") && !!dateRange(a.dates).start && dateRange(a.dates).start === dateRange(b.dates).start,
    (a, b) => !!a.title && key(a.title) === key(b.title ?? "") && !!dateRange(a.dates).start && dateRange(a.dates).start === dateRange(b.dates).start,
    (a, b) => similarity(experienceLabel(a), experienceLabel(b)) >= 0.8,
  ]);
  for (const pair of experience.pairs) {
    const level = experience.byMatcher.get(pair)!;
    const { previous: old, current: now } = pair;
    if (level === 1) {
      const before = LEADER.test(old.title ?? "");
      const after = LEADER.test(now.title ?? "");
      const direction: ChangeDirection = after && !before ? "improved" : before && !after ? "weaker" : "changed";
      changes.push(
        change("experience", "role_changed", experienceLabel(now), after && !before ? "Now in a leadership role" : "Role changed", "major", direction, {
          previous: old.title,
          current: now.title,
        }),
      );
    }
    if (level === 2) {
      changes.push(change("experience", "company_changed", experienceLabel(now), "Company changed", "major", "changed", { previous: old.company, current: now.company }));
    }
    const wasCurrent = /present/.test(dateRange(old.dates).end);
    const end = dateRange(now.dates).end;
    if (wasCurrent && end && !/present/.test(end)) {
      changes.push(change("experience", "role_ended", experienceLabel(now), "Role ended", "meaningful", "changed", { previous: "Present", current: dateRange(now.dates).end }));
    }
    compareField("experience", experienceLabel(now), old.description, now.description);
  }
  if (canAdd("experience")) {
    for (const entry of experience.added) {
      const title = INTERN.test(entry.title ?? "") ? "New internship" : LEADER.test(entry.title ?? "") ? "New leadership role" : "New role";
      changes.push(change("experience", "added", experienceLabel(entry), title, "major", "improved", { current: experienceLabel(entry) }));
    }
  }
  if (canRemove("experience")) {
    for (const entry of experience.removed) changes.push(change("experience", "removed", experienceLabel(entry), REMOVED_TITLE.experience, "major", "weaker", { previous: experienceLabel(entry) }));
  }

  const education = pairUp(baseline.education, current.education, [
    (a, b) => key(a.school ?? "") === key(b.school ?? "") && agrees(key(a.degree ?? ""), key(b.degree ?? "")),
    (a, b) => !!a.school && key(a.school) === key(b.school ?? ""),
  ]);
  for (const pair of education.pairs) {
    const { previous: old, current: now } = pair;
    if (education.byMatcher.get(pair) === 1 && old.degree && now.degree && compareText(old.degree, now.degree).verdict !== "same") {
      changes.push(change("education", "degree_changed", educationLabel(now), "Degree or program changed", "meaningful", "changed", { previous: old.degree, current: now.degree }));
    }
    compareField("education", educationLabel(now), old.description, now.description);
  }
  if (canAdd("education")) for (const entry of education.added) changes.push(change("education", "added", educationLabel(entry), ADDED_TITLE.education, "meaningful", "improved", { current: educationLabel(entry) }));
  if (canRemove("education")) for (const entry of education.removed) changes.push(change("education", "removed", educationLabel(entry), REMOVED_TITLE.education, "meaningful", "weaker", { previous: educationLabel(entry) }));

  const lists = new Map<ListSection, ReturnType<typeof pairUp<ProfileListEntry>>>();
  for (const section of LIST_SECTIONS) {
    const result = pairUp(baseline[section], current[section], [
      (a, b) => !!a.name && key(a.name) === key(b.name ?? ""),
      (a, b) => similarity(listLabel(a), listLabel(b)) >= 0.75,
    ]);
    lists.set(section, result);
    for (const { previous: old, current: now } of result.pairs) {
      if (section === "languages") {
        const before = proficiencyRank(old.description);
        const after = proficiencyRank(now.description);
        if (before !== -1 && after !== -1 && before !== after) {
          changes.push(change(section, "proficiency_changed", listLabel(now), "Language proficiency changed", "meaningful", after > before ? "improved" : "weaker", { previous: old.description, current: now.description }));
        }
        continue;
      }
      compareField(section, listLabel(now), old.description, now.description);
    }
    if (canAdd(section)) for (const entry of result.added) changes.push(change(section, "added", listLabel(entry), ADDED_TITLE[section], "meaningful", "improved", { current: listLabel(entry) }));
    if (canRemove(section)) for (const entry of result.removed) changes.push(change(section, "removed", listLabel(entry), REMOVED_TITLE[section], "meaningful", "weaker", { previous: listLabel(entry) }));
  }

  const previousSkills = new Map(baseline.skills.map((s) => [key(s), s]));
  const currentSkills = new Map(current.skills.map((s) => [key(s), s]));
  const addedSkills = [...currentSkills].filter(([k]) => !previousSkills.has(k)).map(([, s]) => s);
  const removedSkills = [...previousSkills].filter(([k]) => !currentSkills.has(k)).map(([, s]) => s);
  if (canAdd("skills") && addedSkills.length > 0) changes.push(change("skills", "added", listOf(addedSkills), ADDED_TITLE.skills, "meaningful", "improved", { current: listOf(addedSkills) }));
  if (canRemove("skills") && removedSkills.length > 0) changes.push(change("skills", "removed", listOf(removedSkills), REMOVED_TITLE.skills, "meaningful", "weaker", { previous: listOf(removedSkills) }));

  function nextSnapshot(unresolved: ReadonlySet<string>): LinkedInProfile {
    const keepOld = (section: ChangeSection, context: string) => unresolved.has(`${section}:text_changed:${key(context)}`);
    const text = (field: "headline" | "about") => {
      const verdict = fieldVerdicts.get(field);
      if (!current[field]) return baseline[field];
      if (!verdict) return current[field];
      if (verdict.verdict === "same" || keepOld(field, field === "headline" ? "Headline" : "About")) return longest(baseline[field], current[field], verdict);
      return current[field];
    };
    const merge = <T extends { description?: string }>(section: ChangeSection, result: { pairs: Pair<T>[]; added: T[]; removed: T[] }, label: (entry: T) => string): T[] => {
      const kept = result.pairs.map(({ previous: old, current: now }) => {
        if (keepOld(section, label(now))) return { ...now, description: old.description };
        return compareText(old.description, now.description).verdict === "same" || !canAdd(section) ? richer(old, now) : now;
      });
      return [...kept, ...result.added, ...(canRemove(section) ? [] : result.removed)];
    };
    const listEntries = Object.fromEntries(LIST_SECTIONS.map((section) => [section, merge(section, lists.get(section)!, listLabel)])) as Record<ListSection, ProfileListEntry[]>;
    return {
      ...current,
      name: current.name ?? baseline.name,
      location: current.location ?? baseline.location,
      headline: text("headline"),
      about: text("about"),
      experience: merge("experience", experience, experienceLabel),
      education: merge("education", education, educationLabel),
      ...listEntries,
      skills: canRemove("skills") ? current.skills : [...current.skills, ...removedSkills],
      extracted: current.extracted || baseline.extracted,
    };
  }

  return { changes, pending, nextSnapshot };
}

function longest(previous: string | undefined, current: string | undefined, verdict: TextVerdict): string | undefined {
  if (verdict.verdict !== "same") return previous;
  return (previous ?? "").length >= (current ?? "").length ? previous : current;
}

function agrees(a: string, b: string): boolean {
  return !a || !b || a === b;
}

function listOf(items: string[]): string {
  return items.length <= 5 ? items.join(", ") : `${items.slice(0, 5).join(", ")} and ${items.length - 5} more`;
}

function metricChange(section: ChangeSection, context: string, metric: MetricDifference): ProfileChange {
  const id = (kind: ChangeKind, value: string) => ({ id: `${section}:${kind}:${key(`${context} ${value}`)}` });
  if (metric.previous && metric.current) {
    return change(section, "metric_changed", context, metric.direction === "improved" ? "Stronger impact" : "Smaller reported impact", metric.significance, metric.direction, {
      ...id("metric_changed", metric.previous.text),
      previous: metric.previous.text,
      current: metric.current.text,
      explanation: `${metric.previous.text} → ${metric.current.text}`,
    });
  }
  if (metric.current) {
    return change(section, "metric_added", context, "Measurable impact added", metric.significance, "improved", { ...id("metric_added", metric.current.text), current: metric.current.text, explanation: `Now lists ${metric.current.text}` });
  }
  return change(section, "metric_removed", context, "Metric no longer listed", metric.significance, "weaker", { ...id("metric_removed", metric.previous!.text), previous: metric.previous!.text, explanation: `No longer lists ${metric.previous!.text}` });
}
