// A small, hand-curated concept graph. This is what makes evidence classification "semantic"
// without a neural embedding model. Two axes:
//
//   DOMAIN: what field is this text about (engineering, software, robotics)? Alias matching,
//           shared between evidence extraction and criterion parsing.
//   ROLE LEVEL: how deeply engaged is the person (interested < learning < participant <
//           experienced < leader)? Section sets a default, explicit language can raise it.
import type { ProfileSectionName } from "../models/profile";

export const ROLE_LEVEL = {
  NONE: 0,
  INTERESTED: 1,
  LEARNER: 2,
  PARTICIPANT: 3,
  PROFESSIONAL: 4,
  LEADER: 5,
} as const;

export type RoleLevelName = keyof typeof ROLE_LEVEL;

// The baseline role level implied just by which section a piece of text came from.
const SECTION_DEFAULT_ROLE_LEVEL: Partial<Record<ProfileSectionName | "headline" | "location", number>> = {
  about: ROLE_LEVEL.INTERESTED,
  experience: ROLE_LEVEL.PROFESSIONAL,
  education: ROLE_LEVEL.LEARNER,
  skills: ROLE_LEVEL.INTERESTED,
  projects: ROLE_LEVEL.LEARNER,
  certifications: ROLE_LEVEL.LEARNER,
  organizations: ROLE_LEVEL.PARTICIPANT,
  volunteering: ROLE_LEVEL.PARTICIPANT,
  headline: ROLE_LEVEL.PARTICIPANT,
  languages: ROLE_LEVEL.NONE,
  location: ROLE_LEVEL.NONE,
};

export function wordBoundaryMatches(lowerText: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(lowerText);
}

export function matchesAny(lowerText: string, phrases: string[]): boolean {
  return phrases.some((phrase) => wordBoundaryMatches(lowerText, phrase));
}

// An explicit "student" self-description overrides the section default (mainly headline).
// Not applied to "experience" entries, where teaching students is real work, not being one.
const STUDENT_SELF_DESCRIPTION = ["student", "studying", "undergraduate", "undergrad"];

// Leadership/mentoring language, the strongest signal, same regardless of section.
export const LEADER_WORDS = [
  "led",
  "lead",
  "leading",
  "founder",
  "founded",
  "co-founder",
  "president",
  "captain",
  "director",
  "mentor",
  "mentored",
  "mentoring",
  "coach",
  "coached",
  "coaching",
  "advisor",
  "advised",
  "chief",
  "chairman",
  "chairwoman",
  "chairperson",
  "vice president",
  "principal investigator",
  "tutor",
  "tutored",
  "tutoring",
  "managed",
  "management",
  "supervisor",
  "supervised",
];

// Professional/employment language. Excluded from "education", where a degree title like
// "Software Engineering" isn't a job title.
export const PROFESSIONAL_WORDS = [
  "engineer",
  "developer",
  "programmer",
  "scientist",
  "analyst",
  "designer",
  "consultant",
  "specialist",
  "employed",
  "worked as",
  "intern",
  "internship",
  "full-time",
  "part-time",
  "professional",
];
const PROFESSIONAL_WORDS_EXCLUDED_SECTIONS = new Set<ProfileSectionName | "headline" | "location">(["education"]);

// Formal-learning language, degrees, coursework, enrollment.
export const LEARNER_WORDS = [
  "student",
  "studying",
  "coursework",
  "b.s.",
  "bs ",
  "m.s.",
  "ms ",
  "bachelor",
  "master",
  "ph.d",
  "phd",
  "candidate",
  "pursuing",
  "degree",
];

// Mere interest, the weakest real signal, still worth distinguishing from nothing at all.
export const INTERESTED_WORDS = ["interested in", "aspiring", "passionate about", "enthusiast", "hobby"];

function boostFromWordLists(lowerText: string, section: ProfileSectionName | "headline" | "location"): number {
  let boost: number = ROLE_LEVEL.NONE;
  if (matchesAny(lowerText, LEADER_WORDS)) boost = Math.max(boost, ROLE_LEVEL.LEADER);
  if (!PROFESSIONAL_WORDS_EXCLUDED_SECTIONS.has(section) && matchesAny(lowerText, PROFESSIONAL_WORDS)) {
    boost = Math.max(boost, ROLE_LEVEL.PROFESSIONAL);
  }
  if (matchesAny(lowerText, LEARNER_WORDS)) boost = Math.max(boost, ROLE_LEVEL.LEARNER);
  if (matchesAny(lowerText, INTERESTED_WORDS)) boost = Math.max(boost, ROLE_LEVEL.INTERESTED);
  return boost;
}

/** The role level a piece of evidence text demonstrates, given which section it came from. */
export function detectRoleLevel(text: string, section: ProfileSectionName | "headline" | "location"): number {
  const lower = text.toLowerCase();

  if (section !== "experience" && matchesAny(lower, STUDENT_SELF_DESCRIPTION)) {
    // Still let genuine leadership language in the same text win out (e.g. "Student body
    // president" is a real leadership role, not merely a student).
    return Math.max(ROLE_LEVEL.LEARNER, matchesAny(lower, LEADER_WORDS) ? ROLE_LEVEL.LEADER : ROLE_LEVEL.NONE);
  }

  const sectionDefault = SECTION_DEFAULT_ROLE_LEVEL[section] ?? ROLE_LEVEL.PARTICIPANT;
  return Math.max(sectionDefault, boostFromWordLists(lower, section));
}

// One recognized domain, a canonical id plus every phrase that indicates it. Shared by
// evidence extraction and criterion parsing, so the two vocabularies never drift apart.
export interface DomainConcept {
  id: string;
  aliases: string[];
}

export const DOMAIN_CONCEPTS: DomainConcept[] = [
  {
    // Excludes the bare word "engineer", that's a profession, not a domain. Otherwise
    // "software engineer" would falsely cross-match "Mechanical Engineering" evidence.
    id: "engineering",
    aliases: [
      "engineering",
      "mechanical engineering",
      "electrical engineering",
      "civil engineering",
      "aerospace engineering",
      "chemical engineering",
      "industrial engineering",
      "biomedical engineering",
    ],
  },
  {
    id: "software",
    aliases: [
      "software",
      "software engineering",
      "computer science",
      "programming",
      "coding",
      "developer",
      "full stack",
      "backend",
      "frontend",
      "web development",
      "app development",
    ],
  },
  {
    id: "robotics",
    aliases: ["robotics", "robot", "frc", "first robotics", "vex robotics", "vex", "ftc"],
  },
  {
    id: "data_science",
    aliases: [
      "data science",
      "machine learning",
      "artificial intelligence",
      " ai ",
      "deep learning",
      "data analysis",
      "data analytics",
      "neural network",
    ],
  },
  { id: "business", aliases: ["business", "management", "marketing", "sales", "entrepreneurship", "startup"] },
  { id: "finance", aliases: ["finance", "financial", "accounting", "investment", "banking"] },
  { id: "education", aliases: ["teaching", "tutoring", "education", "instructor", "curriculum"] },
  { id: "healthcare", aliases: ["healthcare", "medicine", "medical", "clinical", "nursing", "biomedical"] },
  { id: "science", aliases: ["biology", "chemistry", "physics", "research", "laboratory", "scientific"] },
  { id: "design", aliases: ["design", "ux", "ui", "graphic design", "product design"] },
  { id: "law", aliases: ["law", "legal", "paralegal", "attorney"] },
];

export function detectDomains(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const concept of DOMAIN_CONCEPTS) {
    if (concept.aliases.some((alias) => wordBoundaryMatches(lower, alias))) found.push(concept.id);
  }
  return found;
}
