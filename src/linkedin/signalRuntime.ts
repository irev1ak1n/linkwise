import { SignalAnalysisController, type SignalAnalysisState } from "../ai/signalAnalysisController";
import type { InlineHighlightDTO } from "../ai/signalTypes";
import type { LinkedInProfile } from "../models/profile";
import { SignalHighlighter } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";
import { profileIdentityKey } from "./profileAdapter";
import type { PanelProfileData } from "./panel/panelStore";

export const INLINE_MIN_IMPORTANCE = 0.5;

export interface SignalTickInput {
  /** Run the analysis: Signal Mode is on, or Profile Analyzer is open to show its Key Evidence. */
  enabled: boolean;
  /** Paint the highlights on the page: Signal Mode itself. Defaults to enabled. */
  highlight?: boolean;
  href: string;
  profileKey: string | null;
  profile: LinkedInProfile | null;
  ready: boolean;
  /** The active goal as text; ranking leans on it a little, and works without one. */
  goalText?: string | null;
}

export function isMainProfilePage(href: string): boolean {
  return /linkedin\.com\/in\/[^/?#]+\/?(?:[?#]|$)/.test(href);
}

export function isProfileSessionPage(href: string): boolean {
  return isMainProfilePage(href) || /linkedin\.com\/in\/[^/?#]+\/details\/[^/?#]+\/?(?:[?#]|$)/.test(href);
}

// Panel data can still describe the previous profile for a tick after SPA navigation.
export function signalTickInput(enabled: boolean, href: string, data: PanelProfileData, highlight = enabled, goalText: string | null = null): SignalTickInput {
  const profileKey = profileIdentityKey(href);
  const current = profileKey !== null && data.profileKey === profileKey;
  return {
    enabled,
    highlight,
    href,
    profileKey,
    profile: current ? data.profile : null,
    ready: current && data.collection?.status === "settled" && data.autoScanProgress?.status !== "scanning",
    goalText,
  };
}

export function signalTargets(highlights: InlineHighlightDTO[]): SignalTarget[] {
  return highlights
    .filter((s) => s.importance >= INLINE_MIN_IMPORTANCE)
    .map((s, i) => ({ key: `${s.evidenceId}#${i}`, section: s.section, quote: s.quote, metrics: s.metrics }));
}

export interface SignalRuntimeOptions {
  highlighter: Pick<SignalHighlighter, "render" | "clear">;
  publish: (state: SignalAnalysisState, highlighted: number) => void;
  createController?: (onChange: () => void) => Pick<SignalAnalysisController, "update" | "reset" | "getState">;
}

export function createSignalRuntime(options: SignalRuntimeOptions) {
  const { highlighter, publish } = options;
  const controller = options.createController?.(() => paint()) ?? new SignalAnalysisController({ onChange: () => paint() });
  let activeProfileKey: string | null = null;
  let highlightOn = false;

  function paint(): void {
    const state = controller.getState();
    const current = state.status === "ready" && state.profileKey === activeProfileKey && highlightOn;
    const count = current ? highlighter.render(signalTargets(state.highlights)) : 0;
    if (!current) highlighter.clear();
    publish(activeProfileKey ? state : { status: "idle" }, count);
  }

  function tick(input: SignalTickInput): void {
    highlightOn = input.highlight ?? input.enabled;
    if (!input.enabled || !input.profileKey || !isProfileSessionPage(input.href)) {
      activeProfileKey = null;
      controller.reset();
      paint();
      return;
    }
    if (input.profileKey !== activeProfileKey) {
      activeProfileKey = input.profileKey;
      controller.reset();
    }
    if (input.ready && input.profile) controller.update({ profileKey: input.profileKey, profile: input.profile, goalText: input.goalText ?? null });
    paint();
  }

  function dispose(): void {
    activeProfileKey = null;
    controller.reset();
    highlighter.clear();
  }

  return { tick, dispose };
}
