// Turns raw profile text into tagged ProfileEvidence, so matching and the Analysis screen
// always see the same interpretation of it. Never invents evidence for an empty category.
import type { LinkedInProfile, ProfileSectionName } from "../models/profile";
import { profileTextFields } from "../models/profile";
import type { EvidenceItem, ProfileEvidence } from "../models/evidence";
import { detectDomains, detectRoleLevel, ROLE_LEVEL } from "./conceptGraph";

const LEADER_TEXT_PATTERN = /\b(led|lead|leading|founder|founded|president|captain|director|managed|management)\b/i;
const MENTOR_TEXT_PATTERN = /\b(mentor|mentored|mentoring|coach|coached|coaching|tutor|tutored|tutoring|advisor|advised)\b/i;
const COMPETITION_TEXT_PATTERN = /\b(competition|championship|regional|tournament|hackathon|challenge)\b/i;
const INTEREST_TEXT_PATTERN = /\b(interested in|passionate about|enthusiast|hobby|aspiring)\b/i;

function toEvidenceItem(field: { text: string; section: ProfileSectionName | "headline" | "location" }): EvidenceItem {
  return {
    text: field.text,
    sourceSection: field.section,
    domains: detectDomains(field.text),
    roleLevel: detectRoleLevel(field.text, field.section),
  };
}

export function buildProfileEvidence(profile: LinkedInProfile): ProfileEvidence {
  const fields = profileTextFields(profile);
  const all = fields.map(toEvidenceItem);

  const bySection = (sections: (ProfileSectionName | "headline" | "location")[]) =>
    all.filter((item) => sections.includes(item.sourceSection));

  const evidence: ProfileEvidence = {
    roles: bySection(["headline", "experience"]),
    companies: bySection(["experience"]),
    education: bySection(["education"]),
    fieldsOfStudy: bySection(["education"]).filter((item) => item.domains.length > 0),
    skills: bySection(["skills"]),
    projects: bySection(["projects"]),
    organizations: bySection(["organizations"]),
    leadership: all.filter((item) => LEADER_TEXT_PATTERN.test(item.text) || item.roleLevel >= ROLE_LEVEL.LEADER),
    mentoring: all.filter((item) => MENTOR_TEXT_PATTERN.test(item.text)),
    competitions: all.filter((item) => item.domains.includes("robotics") && COMPETITION_TEXT_PATTERN.test(item.text)),
    locations: bySection(["location"]),
    languages: bySection(["languages"]),
    interests: all.filter((item) => INTEREST_TEXT_PATTERN.test(item.text)),
    accomplishments: bySection(["certifications"]),
    all,
    sectionsWithContent: new Set(fields.map((field) => field.section)),
  };

  return evidence;
}
