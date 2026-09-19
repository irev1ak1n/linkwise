import { useEffect, useRef, useState } from "react";
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";
import type { MatchResult } from "../../matching/scoreProfile";
import { AiAnalysisController, type AiAnalysisState } from "../../ai/aiAnalysisController";

export type { AiAnalysisState };

// Thin React wrapper around AiAnalysisController. One instance lives for the component's
// whole lifetime. The effect re-runs only when goal/profile/localResult genuinely change
// identity, or enabled flips.
export function useAiAnalysis(
  goal: Goal | null,
  profile: LinkedInProfile | null,
  localResult: MatchResult | null,
  enabled: boolean,
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
  }, [goal, profile, localResult, enabled]);

  return state;
}
