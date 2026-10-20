// The overall Profile Optimizer score, computed here from the section assessments so it never
// depends on a number the model chose. It measures how strong and complete the visible profile is:
// core sections always count, while a missing optional section only counts when adding it would
// matter a lot, so a profile is never punished for skipping sections it does not need.
import { OPTIMIZER_SECTIONS, type SectionPresence } from "./sections";
import type { OptimizerImpact, SectionAssessmentDTO } from "./optimizerTypes";

const IMPROVE_VALUE: Record<OptimizerImpact, number> = { high: 0.4, medium: 0.65, low: 0.85 };
// A present section the analysis did not comment on is treated as fine but unconfirmed.
const UNASSESSED_PRESENT_VALUE = 0.8;
const MISSING_OPTIONAL_HIGH_VALUE = 0.3;

export function computeOptimizerScore(presence: SectionPresence[], assessments: SectionAssessmentDTO[]): number {
  let earned = 0;
  let possible = 0;
  for (const { section, weight, core } of OPTIMIZER_SECTIONS) {
    const present = presence.find((p) => p.section === section)?.present ?? false;
    const assessment = assessments.find((a) => a.section === section);
    let value: number | null;
    if (present) {
      value = !assessment ? UNASSESSED_PRESENT_VALUE : assessment.state === "strong" ? 1 : IMPROVE_VALUE[assessment.impact];
    } else if (core) {
      value = 0;
    } else {
      value = assessment?.state === "add" && assessment.impact === "high" ? MISSING_OPTIONAL_HIGH_VALUE : null;
    }
    if (value === null) continue;
    earned += weight * value;
    possible += weight;
  }
  return possible === 0 ? 0 : Math.round((100 * earned) / possible);
}

/** A short reading of the score, from the score alone so the two can never disagree. */
export function scoreBand(score: number): string {
  if (score >= 80) return "Strong profile";
  if (score >= 60) return "Good foundation";
  return "Needs improvement";
}
