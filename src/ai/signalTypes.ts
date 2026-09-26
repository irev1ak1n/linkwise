import type { ProfileSectionName } from "../models/profile";

export type SignalType =
  | "role"
  | "leadership"
  | "quantified_impact"
  | "achievement"
  | "technical_skill"
  | "project_scope"
  | "duration"
  | "audience_scale"
  | "credential"
  | "language"
  | "other_evidence";

export interface ProfileSignalDTO {
  evidenceId: string;
  section: ProfileSectionName | "headline" | "location";
  quote: string;
  type: SignalType;
  strength: "strong" | "moderate";
  importance: number;
  metrics: string[];
}

export interface SignalFactDTO {
  text: string;
  evidenceId: string;
}

export type AnalyzeSignalsApiResponse =
  | { status: "signals"; model: string; signals: ProfileSignalDTO[]; facts: SignalFactDTO[] }
  | { status: "not_configured" }
  | { status: "unavailable"; reason: string }
  | { status: "invalid_request"; message: string };

export type SignalAnalysisOutcome =
  | { status: "ok"; signals: ProfileSignalDTO[]; facts: SignalFactDTO[] }
  | { status: "unavailable"; reason: string };
