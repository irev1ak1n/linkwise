// Builds the actual "Profile Analysis" the mission calls for — Summary, Why they match,
// What's missing, an Experience assessment, and a Recommendation — entirely from controlled
// templates and the evidence scoreProfileAgainstGoal / buildProfileEvidence already produced.
// No generative API: every sentence is assembled from fixed phrase pools chosen by simple,
// deterministic conditions on real data, so the same goal+profile always produces the same
// analysis and every phrase traces back to a real MatchReason/MissingItem/EvidenceItem. The
// architecture (a plain "build sentences from selected evidence" pass) stays free to swap in an
// optional future generative pass later without touching scoreProfileAgainstGoal at all.
import type { Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { ProfileEvidence } from "../models/evidence";
import { ROLE_LEVEL } from "../evidence/conceptGraph";
import type { MatchReason, MatchResult, MissingItem } from "./scoreProfile";
import { matchBand, matchDisplayState } from "./matchColors";

export type ExperienceLevel = "limited" | "developing" | "relevant" | "strong" | "extensive";

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  limited: "Limited experience",
  developing: "Developing experience",
  relevant: "Relevant experience",
  strong: "Strong experience",
  extensive: "Extensive experience",
};

export interface StrengthItem {
  label: string;
  detail: string;
  /** The local deterministic reason this traces back to — present for every LOCALLY-generated
   * strength; absent for a strength sourced from the backend's OpenAI narrative instead (see
   * src/ai/mergeIntoAnalysis.ts), which has no single local MatchReason to point to. */
  reason?: MatchReason;
}

export interface GapItem {
  label: string;
  detail?: string;
  /** See StrengthItem.reason's doc comment — absent for an AI-sourced gap. */
  missing?: MissingItem;
}

export type RecommendationLabel =
  | "Strong candidate — worth contacting"
  | "Worth contacting"
  | "Consider / investigate further"
  | "Low priority"
  | "Not worth prioritizing for this goal";

export interface Recommendation {
  label: RecommendationLabel;
  reason: string;
}

export interface ProfileAnalysis {
  summary: string;
  strengths: StrengthItem[];
  gaps: GapItem[];
  experienceLevel: ExperienceLevel;
  /** A one-sentence explanation of the experience level, sourced from the backend's AI
   * narrative (see src/ai/mergeIntoAnalysis.ts) — undefined for the local-only template, which
   * has no natural-language generation of its own. */
  experienceLevelReason?: string;
  recommendation: Recommendation;
}

/** Confirmed live: without this, a mechanical engineering student with one internship, one
 * part-time instructional-aide role, and one unrelated part-time lifeguard job read as
 * "Extensive experience" — the section-default PROFESSIONAL role level (see conceptGraph.ts)
 * treats every "Experience" entry as equally career-grade, but LinkedIn itself tags an
 * internship as a distinct, bounded, trainee-level employment type. Excluding internship
 * entries from the full-professional tally (they still count toward the lesser "strong" tier
 * below) keeps "extensive"/"strong" meaning what they say, without touching the shared
 * ROLE_LEVEL ladder that criterion matching elsewhere still relies on. */
const INTERNSHIP_TEXT_PATTERN = /\b(intern|internship)\b/i;

/** A general read of how much real professional/leadership depth the profile as a whole shows
 * — independent of any one goal's criteria, since this is a statement about the person's
 * overall evidence, not their fit for this specific search. Based only on evidence strength/
 * role level actually found in the profile text; never on age, tenure length, or any protected
 * characteristic, none of which this evidence model even represents. */
export function assessExperienceLevel(evidence: ProfileEvidence): ExperienceLevel {
  const seniorRoles = evidence.companies.filter(
    (item) => item.roleLevel >= ROLE_LEVEL.PROFESSIONAL && !INTERNSHIP_TEXT_PATTERN.test(item.text),
  ).length;
  const internshipRoles = evidence.companies.filter(
    (item) => item.roleLevel >= ROLE_LEVEL.PROFESSIONAL && INTERNSHIP_TEXT_PATTERN.test(item.text),
  ).length;
  const hasLeadership = evidence.leadership.length > 0;

  if (seniorRoles >= 3 || (seniorRoles >= 2 && hasLeadership)) return "extensive";
  if (seniorRoles >= 2 || (seniorRoles >= 1 && hasLeadership) || seniorRoles + internshipRoles >= 3) return "strong";
  if (seniorRoles >= 1 || internshipRoles >= 1 || hasLeadership || evidence.competitions.length > 0) return "relevant";
  if (evidence.education.length > 0 || evidence.projects.length > 0 || evidence.organizations.length > 0 || evidence.skills.length > 0) {
    return "developing";
  }
  return "limited";
}

function buildSummary(goal: Goal, profile: LinkedInProfile, result: MatchResult, experienceLevel: ExperienceLevel): string {
  if (!result.profileExtracted) {
    return "This profile hasn't finished loading yet, so no meaningful summary is available.";
  }

  const sentences: string[] = [];

  const topStrengths = result.reasons.filter((r) => r.strength === "strong").slice(0, 2);
  if (topStrengths.length > 0) {
    const phrase = topStrengths.map((r) => r.criterion.label).join(" and ");
    sentences.push(`This profile shows strong, confirmed evidence for ${phrase}.`);
  } else if (result.reasons.length > 0) {
    const phrase = result.reasons.map((r) => r.criterion.label).join(" and ");
    sentences.push(`This profile shows related, though not fully confirmed, evidence for ${phrase}.`);
  } else if (profile.headline) {
    sentences.push(`"${profile.headline}" is the clearest signal available on this profile so far.`);
  } else {
    sentences.push("Very little relevant information has been found on this profile so far.");
  }

  if (experienceLevel === "extensive" || experienceLevel === "strong") {
    sentences.push("The profile also shows substantial real-world professional or leadership experience.");
  } else if (experienceLevel === "relevant") {
    sentences.push("The profile shows some direct experience beyond coursework or casual interest.");
  } else if (experienceLevel === "developing") {
    sentences.push("Most of the evidence here reflects education, projects, or membership rather than professional experience.");
  }

  const unresolvedMustHaves = result.missing.filter((m) => m.criterion.importance === "MUST_HAVE");
  if (unresolvedMustHaves.length > 0) {
    const phrase = unresolvedMustHaves.map((m) => m.criterion.label).join(", ");
    sentences.push(`${unresolvedMustHaves.length > 1 ? "Several required criteria" : "A required criterion"} (${phrase}) could not be confirmed.`);
  }

  const state = matchDisplayState(result);
  if (state.kind === "low_confidence") {
    sentences.push(`Overall, this reads as ${goal.name.length > 0 ? `a candidate for "${goal.name}"` : "a potential match"}, but only a small part of the profile has been read so far.`);
  } else if (result.scorePercent !== null) {
    const band = matchBand(result.scorePercent);
    const bandPhrase = band === "strong" ? "a strong overall match" : band === "potential" ? "a partial match" : "a weak overall match";
    sentences.push(`Overall, this profile is ${bandPhrase} for "${goal.name}".`);
  }

  return sentences.slice(0, 4).join(" ");
}

function buildStrengths(result: MatchResult): StrengthItem[] {
  return result.reasons.map((reason) => ({
    label: `${reason.strength === "strong" ? "Strong" : "Some"} ${reason.criterion.label}`,
    detail: `${reason.evidence.fieldLabel}: "${reason.evidence.snippet}"`,
    reason,
  }));
}

function buildGaps(result: MatchResult): GapItem[] {
  return result.missing.map((missing) => {
    if (missing.strength === "unknown") {
      return { label: `${missing.criterion.label} — not confirmed yet`, detail: "This part of the profile hasn't loaded yet.", missing };
    }
    if (missing.strength === "weak") {
      return { label: `${missing.criterion.label} — only loosely related evidence found`, detail: missing.note, missing };
    }
    return { label: `${missing.criterion.label} not confirmed`, detail: missing.note, missing };
  });
}

function buildRecommendation(result: MatchResult, goalName: string): Recommendation {
  const state = matchDisplayState(result);

  if (state.kind === "excluded") {
    return { label: "Not worth prioritizing for this goal", reason: "The profile shows a confirmed excluded trait for this goal." };
  }
  if (state.kind === "not_enough_info") {
    return { label: "Consider / investigate further", reason: "This goal has no criteria to evaluate yet." };
  }
  if (state.kind === "low_confidence") {
    return { label: "Consider / investigate further", reason: "Only a limited part of the profile has been read so far — the score isn't reliable yet." };
  }

  const score = state.scorePercent;
  if (state.kind === "strong") {
    return result.complete
      ? { label: "Strong candidate — worth contacting", reason: `Strong, well-supported match for "${goalName}".` }
      : { label: "Worth contacting", reason: `Strong overall match for "${goalName}", though one required criterion isn't fully confirmed.` };
  }
  if (state.kind === "potential") {
    return score >= 55
      ? { label: "Worth contacting", reason: `Reasonable partial match for "${goalName}".` }
      : { label: "Consider / investigate further", reason: `Partial match for "${goalName}" — worth a closer look before reaching out.` };
  }
  return score >= 20
    ? { label: "Low priority", reason: `Weak overall match for "${goalName}".` }
    : { label: "Not worth prioritizing for this goal", reason: `Very little relevant evidence found for "${goalName}".` };
}

/** This is a statement about relevance to the CURRENT goal only, not a judgment of the
 * person's worth — the same profile can (and often should) score completely differently under
 * a different goal (see scoreProfile.test.ts's own worked example). */
export function buildProfileAnalysis(goal: Goal, profile: LinkedInProfile, result: MatchResult, evidence: ProfileEvidence): ProfileAnalysis {
  const experienceLevel = assessExperienceLevel(evidence);
  return {
    summary: buildSummary(goal, profile, result, experienceLevel),
    strengths: buildStrengths(result),
    gaps: buildGaps(result),
    experienceLevel,
    recommendation: buildRecommendation(result, goal.name),
  };
}
