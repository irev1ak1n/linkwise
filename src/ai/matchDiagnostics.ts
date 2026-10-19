// Dev-only trace of what each shown Match was computed from, so a score that moves on navigation
// can be explained: which evidence was added or removed, and which criteria changed. Off unless
// localStorage["linkwise:debugMatch"] is "1"; it never affects the analysis itself.
import type { FinalAnalysis } from "./mergeIntoAnalysis";
import type { LinkedInProfile } from "../models/profile";
import { buildEvidencePayload } from "./evidencePayload";
import { hashString } from "./aiAnalysisCache";

const FLAG = "linkwise:debugMatch";

export interface MatchSnapshot {
  profileKey: string;
  route: string;
  score: number | null;
  source: FinalAnalysis["source"];
  evidenceHash: string;
  sections: Record<string, number>;
  evidence: string[];
  criteria: Record<string, string>;
}

function enabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function matchSnapshot(profileKey: string, route: string, profile: LinkedInProfile, final: FinalAnalysis): MatchSnapshot {
  const payload = buildEvidencePayload(profile);
  const sections: Record<string, number> = {};
  for (const item of payload) sections[item.section] = (sections[item.section] ?? 0) + 1;
  const criteria: Record<string, string> = {};
  for (const r of final.result.reasons) criteria[r.criterion.label] = r.strength;
  for (const m of final.result.missing) criteria[m.criterion.label] = m.strength;
  return {
    profileKey,
    route,
    score: final.result.scorePercent,
    source: final.source,
    evidenceHash: hashString(JSON.stringify(payload)),
    sections,
    evidence: payload.map((item) => `${item.section}:${hashString(item.text)}`),
    criteria,
  };
}

const last = new Map<string, MatchSnapshot>();

export function logMatchChange(snapshot: MatchSnapshot): void {
  if (!enabled()) return;
  const before = last.get(snapshot.profileKey);
  last.set(snapshot.profileKey, snapshot);
  if (before && before.evidenceHash === snapshot.evidenceHash && before.score === snapshot.score && before.source === snapshot.source) return;
  const added = before ? snapshot.evidence.filter((e) => !before.evidence.includes(e)) : snapshot.evidence;
  const removed = before ? before.evidence.filter((e) => !snapshot.evidence.includes(e)) : [];
  const changed = before ? Object.entries(snapshot.criteria).filter(([label, s]) => before.criteria[label] !== s).map(([label, s]) => `${label}: ${before.criteria[label] ?? "-"} -> ${s}`) : [];
  const entry = { ...snapshot, beforeScore: before?.score ?? null, added, removed, changed };
  console.info(`[LinkWise match] ${snapshot.profileKey} ${before?.score ?? "-"} -> ${snapshot.score} (${snapshot.route})`, entry);
  window.postMessage({ type: "__linkwise_match_debug__", entry }, "*");
}
