// Turns criteria into short readable bullets for the panel's "Your ideal match" card. Groups
// by groupId so an "X or Y" alternative shows as one bullet instead of two.
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

// Excluded always reads as "Exclude" regardless of category. No category falls back to a
// heading based on importance instead.
export function headingFor(criterion: Pick<Criterion, "importance" | "category">): string {
  if (criterion.importance === "EXCLUDED") return "Exclude";
  const categoryHeading = criterion.category ? CATEGORY_HEADINGS[criterion.category] : "";
  return categoryHeading || IMPORTANCE_FALLBACK_HEADING[criterion.importance];
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

type BulletSource = Pick<Criterion, "id" | "label" | "importance" | "category" | "groupId">;

// Groups by groupId (falling back to the criterion's own id) and joins each group's labels
// with "or". Order-preserving, and never invents text beyond the criteria's own labels.
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
