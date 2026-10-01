import type { JobCardAction } from "../../models/jobsSettings";
import { DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from "../highlightPalette";

const stateByJobId = new Map<string, { action: JobCardAction; color: HighlightColor }>();

export function getTrackedState(jobId: string): JobCardAction {
  return stateByJobId.get(jobId)?.action ?? "none";
}

export function getTrackedColor(jobId: string): HighlightColor {
  return stateByJobId.get(jobId)?.color ?? DEFAULT_HIGHLIGHT_COLOR;
}

export function setTrackedState(jobId: string, state: JobCardAction, color: HighlightColor = DEFAULT_HIGHLIGHT_COLOR): void {
  stateByJobId.set(jobId, { action: state, color });
}

export function clearTrackedStates(): void {
  stateByJobId.clear();
}
