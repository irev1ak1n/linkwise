import { SignalAnalysisController, type SignalAnalysisState } from "../ai/signalAnalysisController";
import type { ProfileSignalDTO } from "../ai/signalTypes";
import type { LinkedInProfile } from "../models/profile";
import { SignalHighlighter } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";

export const INLINE_MIN_IMPORTANCE = 0.6;

export interface SignalTickInput {
  enabled: boolean;
  href: string;
  profileKey: string | null;
  profile: LinkedInProfile | null;
  ready: boolean;
}

export function isMainProfilePage(href: string): boolean {
  return /linkedin\.com\/in\/[^/?#]+\/?(?:[?#]|$)/.test(href);
}

export function signalTargets(signals: ProfileSignalDTO[]): SignalTarget[] {
  return signals
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

  function paint(): void {
    const state = controller.getState();
    const current = state.status === "ready" && state.profileKey === activeProfileKey;
    const count = current ? highlighter.render(signalTargets(state.signals)) : 0;
    if (!current) highlighter.clear();
    publish(activeProfileKey ? state : { status: "idle" }, count);
  }

  function tick(input: SignalTickInput): void {
    if (!input.enabled || !input.profileKey || !isMainProfilePage(input.href)) {
      activeProfileKey = null;
      controller.reset();
      paint();
      return;
    }
    if (input.profileKey !== activeProfileKey) {
      activeProfileKey = input.profileKey;
      controller.reset();
    }
    if (input.ready && input.profile) controller.update({ profileKey: input.profileKey, profile: input.profile });
    paint();
  }

  function dispose(): void {
    activeProfileKey = null;
    controller.reset();
    highlighter.clear();
  }

  return { tick, dispose };
}
