import { useMemo } from "react";
import type { MatchResult } from "../../matching/scoreProfile";
import { matchDisplayColor, matchDisplayLabel, matchDisplayState } from "../../matching/matchColors";
import { EXPERIENCE_LEVEL_LABELS } from "../../matching/profileAnalysis";
import { buildProfileEvidence } from "../../evidence/buildProfileEvidence";
import { buildFinalAnalysis } from "../../ai/mergeIntoAnalysis";
import type { AiAnalysisState } from "./useAiAnalysis";
import type { Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";

interface AnalysisViewProps {
  result: MatchResult;
  goal: Goal;
  profile: LinkedInProfile;
  /** Always already resolved by the time this component ever renders — "ready" or
   * "unavailable" only, never "idle"/"loading" (see analysisPipeline.ts's `computeAnalysisPipelineStage`,
   * which is what gates PanelApp from mounting this component at all until AI has settled one
   * way or the other). */
  aiState: Extract<AiAnalysisState, { status: "ready" } | { status: "unavailable" }>;
}

/** The final, non-provisional Profile Analysis — only ever rendered once the ENTIRE pipeline
 * (scan, criteria, local score, AI analysis) has resolved, never shown as a preview of an
 * in-progress read. This is a statement of relevance to the user's current goal, not a judgment
 * of the person — the same profile can score very differently under a different goal (see
 * scoreProfile.test.ts's own worked example).
 *
 * Shows exactly ONE final analysis, never a local one and an AI one side by side (see
 * src/ai/mergeIntoAnalysis.ts) — the Match %/recommendation are always deterministic; only the
 * narrative text improves when AI succeeds. */
export function AnalysisView({ result, goal, profile, aiState }: AnalysisViewProps) {
  const evidence = useMemo(() => buildProfileEvidence(profile), [profile]);

  const final = useMemo(() => {
    const ai = aiState.status === "ready" ? { result: aiState.outcome.result, narrative: aiState.outcome.narrative } : undefined;
    return buildFinalAnalysis(goal, profile, evidence, result, ai);
  }, [goal, profile, evidence, result, aiState]);

  const { analysis, guidance } = final;
  const state = matchDisplayState(final.result);
  const scoreLabel = "scorePercent" in state ? `${state.scorePercent}%` : null;

  return (
    <div className="lw-analysis">
      <div className="lw-summary-card" style={{ borderColor: matchDisplayColor(state) }}>
        <div className="lw-summary-card__level" style={{ color: matchDisplayColor(state) }}>
          {matchDisplayLabel(state)}
        </div>
        {scoreLabel && <div className="lw-summary-card__score">{scoreLabel}</div>}
        <div className="lw-summary-card__target">For: {goal.name}</div>

        {aiState.status === "unavailable" && aiState.reason !== "not_applicable" && (
          <p className="lw-ai-status">AI analysis unavailable — showing local analysis.</p>
        )}
        {final.source === "ai" && <p className="lw-ai-status lw-ai-status--ai">AI-enhanced analysis</p>}

        {state.kind === "low_confidence" && (
          <p className="lw-summary-card__note">Limited profile information — this score may change once more of the profile loads.</p>
        )}
        {final.result.scorePercent !== null && !final.result.complete && state.kind !== "low_confidence" && (
          <p className="lw-summary-card__note">A Must-Have criterion could not be confirmed on this profile.</p>
        )}
        {final.result.scorePercent === null && (
          <p className="lw-summary-card__note">Add at least one criterion (other than Excluded) to score this profile.</p>
        )}
      </div>

      <section className="lw-section">
        <h3>Summary</h3>
        <p className="lw-summary-text">{analysis.summary}</p>
      </section>

      <section className="lw-section">
        <h3>Recommendation</h3>
        <p className="lw-recommendation">{analysis.recommendation.label}</p>
        <p className="lw-recommendation__reason">{analysis.recommendation.reason}</p>
        <div className="lw-guidance">
          <span className={`lw-guidance__pill lw-guidance__pill--contact-${guidance.contact.replace(/\s+/g, "-").toLowerCase()}`}>
            Contact: {guidance.contact}
          </span>
          <span className={`lw-guidance__pill lw-guidance__pill--save-${guidance.save.replace(/\s+/g, "-").toLowerCase()}`}>
            Save: {guidance.save}
          </span>
        </div>
        {guidance.contactReason && <p className="lw-guidance__reason">{guidance.contactReason}</p>}
        {guidance.saveReason && <p className="lw-guidance__reason">{guidance.saveReason}</p>}
      </section>

      <section className="lw-section">
        <h3>Experience Assessment</h3>
        <p className="lw-experience-level">{EXPERIENCE_LEVEL_LABELS[analysis.experienceLevel]}</p>
        {analysis.experienceLevelReason && <p className="lw-experience-level__reason">{analysis.experienceLevelReason}</p>}
      </section>

      {analysis.strengths.length > 0 && (
        <section className="lw-section">
          <h3>Why They Match</h3>
          <ul className="lw-evidence-list">
            {analysis.strengths.map((strength) => (
              <li key={strength.label} className="lw-evidence-list__item lw-evidence-list__item--strength" title={strength.detail}>
                {strength.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.gaps.length > 0 && (
        <section className="lw-section">
          <h3>What&apos;s Missing</h3>
          <ul className="lw-evidence-list">
            {analysis.gaps.map((gap) => (
              <li key={gap.label} className="lw-evidence-list__item lw-evidence-list__item--gap" title={gap.detail}>
                {gap.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.strengths.length === 0 && analysis.gaps.length === 0 && (
        <p className="lw-empty">No criteria to evaluate for this goal yet.</p>
      )}
    </div>
  );
}
