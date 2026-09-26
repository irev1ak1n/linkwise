import { useCallback, useEffect, useRef, useState } from "react";
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";
import type { MatchResult } from "../../matching/scoreProfile";
import { AiAnalysisController, type AiAnalysisState } from "../../ai/aiAnalysisController";

export type { AiAnalysisState };

// Thin React wrapper around AiAnalysisController. One instance lives for the component's
// whole lifetime, so new evidence refreshes the analysis instead of restarting it.
export function useAiAnalysis(
  goal: Goal | null,
  profile: LinkedInProfile | null,
  localResult: MatchResult | null,
  enabled: boolean,
): { state: AiAnalysisState; retry: () => void } {
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
  }, [goal, profile, localResult, enabled]);

  useEffect(() => () => controllerRef.current?.reset(), []);

  const retry = useCallback(() => {
    if (enabled && goal && profile && localResult) controllerRef.current!.retry(goal, profile, localResult, setState);
  }, [enabled, goal, profile, localResult]);

  return { state, retry };
}
