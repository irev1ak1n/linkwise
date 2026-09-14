// Turns a flat Criterion[] into short, readable "Heading: text" bullets for the in-page panel's
// "Your ideal match" card — a pure display-time projection over the SAME criteria the matching
// engine reads, never a separate summary that could drift out of sync with scoring. Grouping by
// `groupId` (set by nlp/goalTextParser.ts when it expands an "X or Y" alternative phrase into
// multiple criteria) is the one thing this file does beyond a flat one-bullet-per-criterion
// mapping — it's what lets "mechanical or aerospace engineering" show as one bullet joined by
// "or" instead of two, without ever touching how those two criteria are actually scored.
import type { Criterion, CriterionCategory, CriterionImportance } from "../../models/goal";

export interface CriterionBullet {
  key: string;
  heading: string;
  text: string;
  importance: CriterionImportance;
  memberIds: string[];
}

const CATEGORY_HEADINGS: Record<CriterionCategory, string> = {
  role: "Role",
  location: "Location",
  experience: "Experience",
  context: "Can help with",
  other: "",
  organization: "Organization",
  membership: "Membership",
  skill: "Skill",
  education: "Education",
  language: "Language",
  leadership: "Leadership",
  mentoring: "Mentoring",
  competition: "Competition",
  service: "Service",
  project: "Project",
  industry: "Industry",
  interest: "Interest",
};

const IMPORTANCE_FALLBACK_HEADING: Record<CriterionImportance, string> = {
  MUST_HAVE: "Must have",
  PREFERRED: "Preferred",
  OPTIONAL: "Optional",
  EXCLUDED: "Exclude",
};

/** Excluded always reads as "Exclude", regardless of category — an exclusion is a distinct kind
 * of statement (what would disqualify a match) that should never be visually folded into the
 * same heading a same-category positive requirement would use. A criterion with no category
 * (e.g. manually added) falls back to a heading based on its importance instead, so every
 * bullet always has SOME meaningful label. */
export function headingFor(criterion: Pick<Criterion, "importance" | "category">): string {
  if (criterion.importance === "EXCLUDED") return "Exclude";
  const categoryHeading = criterion.category ? CATEGORY_HEADINGS[criterion.category] : "";
  return categoryHeading || IMPORTANCE_FALLBACK_HEADING[criterion.importance];
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

type BulletSource = Pick<Criterion, "id" | "label" | "importance" | "category" | "groupId">;

/**
 * Groups criteria by `groupId` (falling back to each criterion's own id when it has none, so
 * every ungrouped criterion still gets its own bullet) and renders one bullet per group, joining
 * a group's member labels with " or " — preserving that these were stated as alternatives
 * rather than independently-required facts. Order-preserving: bullets appear in the same order
 * their first member appears in the input array. Never invents text: every bullet's words come
 * straight from the criteria's own labels.
 */
export function buildCriterionBullets(criteria: BulletSource[]): CriterionBullet[] {
  const groups = new Map<string, BulletSource[]>();
  const order: string[] = [];
  for (const criterion of criteria) {
    const key = criterion.groupId ?? criterion.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(criterion);
  }
  return order.map((key) => {
    const members = groups.get(key)!;
    const first = members[0];
    return {
      key,
      heading: headingFor(first),
      text: capitalize(members.map((m) => m.label).join(" or ")),
      importance: first.importance,
      memberIds: members.map((m) => m.id),
    };
  });
}
