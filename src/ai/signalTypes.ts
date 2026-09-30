import type { ProfileSectionName } from "../models/profile";

// An exact phrase worth reading in the profile text. Separate from facts: a phrase can be worth
// highlighting without being one of the strongest facts, and a fact can combine several phrases.
export interface InlineHighlightDTO {
  evidenceId: string;
  section: ProfileSectionName | "headline" | "location";
  quote: string;
  type: string;
  importance: number;
  metrics: string[];
}

export interface SignalFactDTO {
  text: string;
  evidenceId: string;
}

export type AnalyzeSignalsApiResponse =
  | { status: "signals"; model: string; highlights: InlineHighlightDTO[]; facts: SignalFactDTO[] }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

export type SignalAnalysisOutcome =
  | { status: "ok"; highlights: InlineHighlightDTO[]; facts: SignalFactDTO[] }
  | { status: "unavailable"; reason: string };
