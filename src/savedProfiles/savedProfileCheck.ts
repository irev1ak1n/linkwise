// A revisit: compare the saved snapshot with what the page shows now, then record the result.
// The baseline is only replaced after the comparison finished, so the "before" is never lost.
import type { LinkedInProfile } from "../models/profile";
import { hashString } from "../ai/aiAnalysisCache";
import { diffProfiles, type TextPair } from "./profileDiff";
import { interpretForGoal, matchImpact } from "./goalImpact";
import { isShown, type AnalysisSnapshot, type ChangeSection, type CheckReport, type GoalSnapshot, type ProfileChange, type SavedProfile, type SnapshotRecord } from "./types";

// Checks this soon after a record was made belong to the same visit.
export const VISIT_WINDOW_MS = 30 * 60 * 1000;

/** null: the wording changed but not the facts. Absent: could not be checked. */
export type SemanticResults = Map<string, ProfileChange | null>;

export interface CheckInput {
  saved: SavedProfile;
  profile: LinkedInProfile;
  completeSections: ChangeSection[];
  goal: GoalSnapshot | null;
  analysis: AnalysisSnapshot | null;
  now: number;
  resolve: (pairs: TextPair[]) => Promise<SemanticResults>;
}

export function evidenceHash(profile: LinkedInProfile, goal: GoalSnapshot | null): string {
  return hashString(JSON.stringify({ profile, goal: goal?.id ?? null }));
}

function union(a: ChangeSection[], b: ChangeSection[]): ChangeSection[] {
  return [...new Set([...a, ...b])];
}

export async function checkSavedProfile(input: CheckInput): Promise<{ next: SavedProfile; report: CheckReport }> {
  const { saved, profile, now } = input;
  const top = saved.history[0]!;
  const hash = evidenceHash(profile, input.goal);

  // Everything seen in the visit that saved this person only fills the snapshot in.
  if (top.origin === "saved" && now - top.recordedAt < VISIT_WINDOW_MS) {
    const merged = diffProfiles(top.profile, profile, { baselineComplete: [], currentComplete: [] }).nextSnapshot(new Set());
    const record: SnapshotRecord = { ...top, profile: merged, completeSections: union(top.completeSections, input.completeSections), goal: input.goal ?? top.goal, analysis: input.analysis ?? top.analysis };
    const report: CheckReport = { checkedAt: now, baselineRecordedAt: top.recordedAt, evidenceHash: hash, changes: [], unchecked: 0, impact: matchImpact(record, input.goal, input.analysis, []), analysis: input.analysis };
    return { next: { ...saved, lastCheckedAt: now, history: [record, ...saved.history.slice(1)], lastCheck: report }, report };
  }

  // A record this visit already made is redone against the one before it.
  const replacing = top.origin === "check" && now - top.recordedAt < VISIT_WINDOW_MS && saved.history.length > 1;
  const baseline = replacing ? saved.history[1]! : top;
  const older = saved.history.slice(replacing ? 2 : 1);

  const diff = diffProfiles(baseline.profile, profile, { baselineComplete: baseline.completeSections, currentComplete: input.completeSections });
  const results = diff.pending.length > 0 ? await input.resolve(diff.pending) : new Map();
  const unresolved = new Set(diff.pending.filter((pair) => !results.has(pair.id)).map((pair) => pair.id));
  const semantic = diff.pending.map((pair) => results.get(pair.id)).filter((change): change is ProfileChange => !!change);

  const seen = new Set<string>();
  const changes = [...diff.changes, ...semantic]
    .filter(isShown)
    .filter((change) => !seen.has(change.id) && !!seen.add(change.id))
    .map((change) => ({ ...change, direction: interpretForGoal(change, input.goal) }));

  const completeSections = union(baseline.completeSections, input.completeSections);
  const impact = matchImpact(baseline, input.goal, input.analysis, changes);
  let history: SnapshotRecord[];
  if (changes.length > 0) {
    const record: SnapshotRecord = { recordedAt: now, origin: "check", profile: diff.nextSnapshot(unresolved), completeSections, goal: input.goal, analysis: input.analysis, changes };
    history = [record, baseline, ...older];
  } else {
    // Nothing meaningful: keep the baseline's wording, only fill in what it had not seen.
    const enriched = diff.nextSnapshot(new Set(diff.pending.map((pair) => pair.id)));
    history = [{ ...baseline, profile: enriched, completeSections }, ...older];
  }

  const report: CheckReport = { checkedAt: now, baselineRecordedAt: baseline.recordedAt, evidenceHash: hash, changes, unchecked: unresolved.size, impact, analysis: input.analysis };
  return { next: { ...saved, profileName: profile.name ?? saved.profileName, lastCheckedAt: now, history, lastCheck: report }, report };
}
