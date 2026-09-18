import { useEffect, useRef, useState } from "react";
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";
import type { MatchResult } from "../../matching/scoreProfile";
import { AiAnalysisController, type AiAnalysisState } from "../../ai/aiAnalysisController";

export type { AiAnalysisState };

/**
 * Thin React wrapper around `AiAnalysisController` (see src/ai/aiAnalysisController.ts for the
 * actual debounce/cache/cancellation logic, unit-tested independently of React). One controller
 * instance lives for the component's whole lifetime via `useRef`; the effect re-runs only when
 * `goal`/`profile`/`localResult` genuinely change identity (both `goal` and `profile` are
 * reference-stable across re-renders unless the underlying store actually changed — see
 * goalStore.ts/panelStore.ts — and `localResult` must be memoized by the caller for the same
 * reason; see PanelApp.tsx), `enabled` flips, or `retryKey` changes.
 *
 * `retryKey` exists purely for PanelApp's manual "Retry" action: if the AI request itself is
 * what got stuck (rather than criteria or the scan), none of `goal`/`profile`/`localResult`/
 * `enabled` necessarily change on retry, so nothing else would tell this effect to run again.
 * Bumping this value is the explicit "try again anyway" signal.
 */
export function useAiAnalysis(
  goal: Goal | null,
  profile: LinkedInProfile | null,
  localResult: MatchResult | null,
  enabled: boolean,
  retryKey = 0,
): AiAnalysisState {
  const [state, setState] = useState<AiAnalysisState>({ status: "idle" });
  const controllerRef = useRef<AiAnalysisController | null>(null);
  if (!controllerRef.current) controllerRef.current = new AiAnalysisController();

  useEffect(() => {
    const controller = controllerRef.current!;
    if (!enabled || !goal || !profile || !localResult) {
      controller.reset();
      setState({ status: "idle" });
      return;
    }

    controller.request(goal, profile, localResult, setState);
    return () => controller.reset();
    // `retryKey` is intentionally dependency-only — the effect body never reads it, it only
    // exists to force a fresh run on demand.
  }, [goal, profile, localResult, enabled, retryKey]);

  return state;
}
