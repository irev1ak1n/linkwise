// Contact/Save guidance — deliberately a pure function OF the same Recommendation
// profileAnalysis.ts already derived from score + Must Have status + evidence confidence,
// rather than a second independent set of thresholds. Two guidance signals computed from one
// underlying judgment can't drift apart or contradict each other on screen.
import type { RecommendationLabel } from "./profileAnalysis";

export type ContactSignal = "Recommended" | "Maybe" | "Not recommended";
export type SaveSignal = "Save" | "Consider saving" | "Skip";

export interface ContactGuidance {
  contact: ContactSignal;
  save: SaveSignal;
  /** Short AI-sourced reasons for the guidance above — undefined for local-only analysis
   * (see src/ai/mergeIntoAnalysis.ts), which has no natural-language generation of its own.
   * Never changes `contact`/`save` themselves: those stay purely a function of the
   * deterministic RecommendationLabel, exactly as before. */
  contactReason?: string;
  saveReason?: string;
}

const GUIDANCE_BY_RECOMMENDATION: Record<RecommendationLabel, ContactGuidance> = {
  "Strong candidate — worth contacting": { contact: "Recommended", save: "Save" },
  "Worth contacting": { contact: "Recommended", save: "Save" },
  "Consider / investigate further": { contact: "Maybe", save: "Consider saving" },
  "Low priority": { contact: "Not recommended", save: "Consider saving" },
  "Not worth prioritizing for this goal": { contact: "Not recommended", save: "Skip" },
};

export function buildContactGuidance(recommendationLabel: RecommendationLabel): ContactGuidance {
  return GUIDANCE_BY_RECOMMENDATION[recommendationLabel];
}
