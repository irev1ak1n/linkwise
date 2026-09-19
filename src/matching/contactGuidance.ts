// Contact/Save guidance, a pure function of the same Recommendation profileAnalysis.ts derives,
// not a second independent set of thresholds. Keeps the two signals from ever contradicting.
import type { RecommendationLabel } from "./profileAnalysis";

export type ContactSignal = "Recommended" | "Maybe" | "Not recommended";
export type SaveSignal = "Save" | "Consider saving" | "Skip";

export interface ContactGuidance {
  contact: ContactSignal;
  save: SaveSignal;
  /** Short AI-sourced reasons, undefined for local-only analysis. Never changes contact/save
   * themselves, those stay a pure function of the recommendation label. */
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
