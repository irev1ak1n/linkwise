import type { CriterionImportance } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { EvidenceStrength } from "../models/evidence";

export type ChangeSignificance = "none" | "minor" | "meaningful" | "major";
export type ChangeDirection = "improved" | "changed" | "weaker";
export type ChangeKind =
  | "added"
  | "removed"
  | "role_changed"
  | "company_changed"
  | "role_ended"
  | "degree_changed"
  | "proficiency_changed"
  | "metric_changed"
  | "metric_added"
  | "metric_removed"
  | "text_changed";

export type ChangeSection =
  | "headline"
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

// An objective change between two snapshots. direction is the goal-independent reading;
// goalImpact.ts interprets it for a particular goal.
export interface ProfileChange {
  id: string;
  kind: ChangeKind;
  section: ChangeSection;
  significance: ChangeSignificance;
  direction: ChangeDirection;
  title: string;
  subject: string;
  previous?: string;
  current?: string;
  explanation?: string;
}

export interface GoalSnapshot {
  id: string;
  name: string;
  criteria: { id: string; label: string; importance: CriterionImportance }[];
}

export interface AnalysisSnapshot {
  matchScore: number | null;
  recommendation: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  criteria: { id: string; label: string; strength: EvidenceStrength }[];
  source: "ai" | "local";
}

// One point in a saved person's history: the evidence LinkWise knew then, and how it scored.
export interface SnapshotRecord {
  recordedAt: number;
  origin: "saved" | "check";
  profile: LinkedInProfile;
  /** Sections whose every entry was visible when this was recorded. */
  completeSections: ChangeSection[];
  goal: GoalSnapshot | null;
  analysis: AnalysisSnapshot | null;
  /** The meaningful changes that led to this record, empty for the original save. */
  changes: ProfileChange[];
}

export interface MatchImpact {
  previous: number | null;
  current: number | null;
  delta: number | null;
  sameGoal: boolean;
  previousGoalName: string | null;
  explanations: string[];
}

export interface CheckReport {
  checkedAt: number;
  baselineRecordedAt: number;
  evidenceHash: string;
  changes: ProfileChange[];
  /** Wording edits the semantic check could not confirm either way. */
  unchecked: number;
  impact: MatchImpact;
  analysis: AnalysisSnapshot | null;
}

export interface SavedProfile {
  profileKey: string;
  profileName: string;
  profileUrl: string;
  savedAt: number;
  lastCheckedAt: number;
  /** Newest first. history[0] is the snapshot the next revisit is compared against. */
  history: SnapshotRecord[];
  lastCheck: CheckReport | null;
  notes: string;
}

export const SHOWN_SIGNIFICANCE: ChangeSignificance[] = ["meaningful", "major"];

export function isShown(change: Pick<ProfileChange, "significance">): boolean {
  return SHOWN_SIGNIFICANCE.includes(change.significance);
}
