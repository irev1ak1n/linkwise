export const MAX_SECTION_SCROLL_STEPS = 12;
export const SECTION_SCROLL_STEP_PX = 600;

export interface SectionScanState {
  url: string;
  arrivedAt: number;
  steps: number;
  startTop: number;
  scrolled: boolean;
  validated: boolean;
}

export interface ScrollBox {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

export type SectionScanStep = "wait" | "scroll" | "finish-scroll" | "extract";

export function startSectionScan(url: string, now: number, startTop: number): SectionScanState {
  return { url, arrivedAt: now, steps: 0, startTop, scrolled: false, validated: false };
}

export function nextSectionScanStep(state: SectionScanState, now: number, settleMs: number, box: ScrollBox): SectionScanStep {
  if (now - state.arrivedAt < settleMs) return "wait";
  if (state.scrolled) return "extract";
  const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
  if (!atEnd && state.steps < MAX_SECTION_SCROLL_STEPS) return "scroll";
  return "finish-scroll";
}
