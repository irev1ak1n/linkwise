// The structured evidence layer between raw profile text and criterion matching. Every piece
// keeps its source section and text so any claim can trace back to something real on the page.
import type { ProfileSectionName } from "./profile";

// How strongly a criterion is supported, a five-way classification so "closely related"
// (Moderate) and "never had the data" (Unknown) are never conflated with confirmed absence.
export type EvidenceStrength = "strong" | "moderate" | "weak" | "missing" | "unknown";

export const EVIDENCE_STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  missing: "Missing",
  unknown: "Unknown",
};

// One piece of text pulled from the profile, tagged with its section and domain/role level,
// so a UI claim like "Strong engineering background" can always show where it came from.
export interface EvidenceItem {
  text: string;
  sourceSection: ProfileSectionName | "headline" | "location";
  /** Canonical domain concept ids this text touches, empty if none match. */
  domains: string[];
  /** The strongest role level this text demonstrates. Section sets a default, explicit
   * language in the text can raise it further, never lower it. */
  roleLevel: number;
}

// A normalized, categorized view of everything buildProfileEvidence found. Criterion matching
// scans "all", the categories are just how the Analysis screen groups things for display.
export interface ProfileEvidence {
  roles: EvidenceItem[];
  companies: EvidenceItem[];
  education: EvidenceItem[];
  fieldsOfStudy: EvidenceItem[];
  skills: EvidenceItem[];
  projects: EvidenceItem[];
  organizations: EvidenceItem[];
  leadership: EvidenceItem[];
  mentoring: EvidenceItem[];
  competitions: EvidenceItem[];
  locations: EvidenceItem[];
  languages: EvidenceItem[];
  interests: EvidenceItem[];
  accomplishments: EvidenceItem[];
  all: EvidenceItem[];
  /** Which sections had any content when this was built, so "confirmed absent" can be told
   * apart from "unknown, never collected". */
  sectionsWithContent: Set<ProfileSectionName | "headline" | "location">;
}

// A traceable claim shown to the user, every strength, gap, or summary sentence must be
// backed by one of these, never free-floating prose.
export interface EvidenceClaim {
  claim: string;
  strength: EvidenceStrength;
  sourceSection: ProfileSectionName | "headline" | "location" | null;
  sourceText: string | null;
}
