// The overall Profile Optimizer score, computed here from the section assessments so it never
// depends on a number the model chose. It measures how strong and complete the visible profile is:
// core sections always count, while a missing optional section only counts when it is relevant to
// this person, so a profile is never punished for skipping sections it does not need.
//
// The score is the sum of a per-section breakdown (status, weight, points earned, reason), so any
// number can be traced to the sections behind it. A section's value comes from its checklist, which
// already includes the user's own answers, so overriding a check moves the score through this same path.
import { OPTIMIZER_SECTIONS, type OptimizerSection, type SectionPresence } from "./sections";
import type { OptimizerImpact, SectionAssessmentDTO } from "./optimizerTypes";

export interface ScoreEvidence {
  id: string;
  section: string;
  text: string;
}

export type SectionScoreStatus = "strong" | "improve" | "unassessed" | "missing" | "missing_relevant" | "optional";

export interface SectionScore {
  section: OptimizerSection;
  status: SectionScoreStatus;
  weight: number;
  /** The weight this section adds to the total: 0 when it is not counted. */
  possible: number;
  earned: number;
  reason: string;
}

export interface ScoreBreakdown {
  score: number;
  sections: SectionScore[];
}

/** How many of a section's verifiable checks passed, so a single answer changes the contribution. */
export type ChecklistRatios = Partial<Record<OptimizerSection, { passed: number; verifiable: number }>>;

const IMPROVE_VALUE: Record<OptimizerImpact, number> = { high: 0.4, medium: 0.65, low: 0.85 };
// A section that needs work earns between this floor and just under full, by how many checks pass.
const IMPROVE_FLOOR = 0.35;
const IMPROVE_SPAN = 0.6;
// A present section the analysis did not comment on is treated as fine but unconfirmed.
const UNASSESSED_PRESENT_VALUE = 0.8;
const MISSING_RELEVANT_VALUE = 0.3;

const BUILT = /\b(built|build|developed|created|designed|launched|programmed|coded|published|made)\b/i;
const ARTIFACT = /\b(website|web ?site|site|web app|app|application|platform|tool|game|product|dashboard|system|software|bot|plugin|extension|portal|store|library|api)\b/i;
const SHOWCASE = /\b(portfolio|github|demo|published|presentation|presented|keynote|article|podcast|talk|webinar|winner|first place|1st place|2nd place|second place|3rd place|placed|finalist|award(?:ed)?)\b|https?:\/\/|www\./i;
const CREDENTIAL = /\b(certified|certification|certificate|licen[sc]e[ds]?)\b/i;

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/);
// Something built and named in a sentence of its own: "Built a yearbook website", not a mention of a skill.
function buildsSomething(text: string): boolean {
  return sentencesOf(text).some((sentence) => BUILT.test(sentence) && ARTIFACT.test(sentence));
}

interface Relevance {
  relevant: boolean;
  reason: string;
  evidenceIds: string[];
}

const idsOf = (items: ScoreEvidence[]) => items.map((item) => item.id);

// Whether an optional section would hold something real for this person, from the profile's own
// evidence alone. Nothing here depends on the model.
export function missingRelevance(section: OptimizerSection, evidence: ScoreEvidence[]): Relevance | null {
  const elsewhere = (own: string) => evidence.filter((item) => item.section !== own && ["experience", "education", "about", "volunteering", "organizations"].includes(item.section));
  if (section === "projects") {
    const found = elsewhere("projects").filter((item) => buildsSomething(item.text));
    return found.length > 0
      ? { relevant: true, reason: "Project work is described in your Experience or About but there is no Projects section, so it is easy to miss.", evidenceIds: idsOf(found) }
      : { relevant: false, reason: "Nothing on your profile describes a project that needs its own section.", evidenceIds: [] };
  }
  if (section === "featured") {
    const found = evidence.filter((item) => item.section === "projects" || item.section === "honors" || SHOWCASE.test(item.text) || (item.section !== "headline" && buildsSomething(item.text)));
    return found.length > 0
      ? { relevant: true, reason: "Your profile mentions public work or recognition, but nothing is featured to show it first.", evidenceIds: idsOf(found) }
      : { relevant: false, reason: "Nothing on your profile obviously needs showcasing yet.", evidenceIds: [] };
  }
  if (section === "certifications") {
    const found = evidence.filter((item) => item.section !== "certifications" && CREDENTIAL.test(item.text));
    return found.length > 0
      ? { relevant: true, reason: "Your profile mentions a credential that has no entry in Licenses & Certifications.", evidenceIds: idsOf(found) }
      : { relevant: false, reason: "Nothing suggests a credential is missing.", evidenceIds: [] };
  }
  return null;
}

export function computeScoreBreakdown(presence: SectionPresence[], assessments: SectionAssessmentDTO[], evidence?: ScoreEvidence[], ratios: ChecklistRatios = {}): ScoreBreakdown {
  const sections: SectionScore[] = OPTIMIZER_SECTIONS.map(({ section, weight, core }): SectionScore => {
    const present = presence.find((p) => p.section === section)?.present ?? false;
    const assessment = assessments.find((a) => a.section === section);
    const counted = (status: SectionScoreStatus, value: number, reason: string): SectionScore => ({ section, status, weight, possible: weight, earned: weight * value, reason });
    const skipped = (reason: string): SectionScore => ({ section, status: "optional", weight, possible: 0, earned: 0, reason });

    if (present) {
      if (!assessment) return counted("unassessed", UNASSESSED_PRESENT_VALUE, "Present; not assessed yet.");
      if (assessment.state === "strong") return counted("strong", 1, "Every verifiable check passed.");
      const ratio = ratios[section];
      if (ratio && ratio.verifiable > 0) {
        return counted("improve", IMPROVE_FLOOR + IMPROVE_SPAN * (ratio.passed / ratio.verifiable), `${ratio.passed} of ${ratio.verifiable} checks passed.`);
      }
      return counted("improve", IMPROVE_VALUE[assessment.impact], assessment.reason || "Needs improvement.");
    }
    if (core) return counted("missing", 0, "A core section is missing.");
    // Optional and missing: it counts only when something suggests it belongs on this profile.
    const relevance = evidence ? missingRelevance(section, evidence) : null;
    if (relevance) return relevance.relevant ? counted("missing_relevant", MISSING_RELEVANT_VALUE, relevance.reason) : skipped(relevance.reason);
    if (assessment?.state === "add" && assessment.impact === "high") return counted("missing_relevant", MISSING_RELEVANT_VALUE, assessment.reason || "Adding it would matter for this profile.");
    return skipped("Optional; nothing suggests it is needed.");
  });
  const possible = sections.reduce((sum, s) => sum + s.possible, 0);
  const earned = sections.reduce((sum, s) => sum + s.earned, 0);
  return { score: possible === 0 ? 0 : Math.round((100 * earned) / possible), sections };
}

export function computeOptimizerScore(presence: SectionPresence[], assessments: SectionAssessmentDTO[], evidence?: ScoreEvidence[], ratios?: ChecklistRatios): number {
  return computeScoreBreakdown(presence, assessments, evidence, ratios).score;
}

/** A short reading of the score, from the score alone so the two can never disagree. */
export function scoreBand(score: number): string {
  if (score >= 80) return "Strong profile";
  if (score >= 60) return "Good foundation";
  return "Needs improvement";
}
