import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { VISIT_WINDOW_MS, checkSavedProfile, type SemanticResults } from "./savedProfileCheck";
import { interpretForGoal, matchImpact } from "./goalImpact";
import type { TextPair } from "./profileDiff";
import type { AnalysisSnapshot, ChangeSection, GoalSnapshot, ProfileChange, SavedProfile, SnapshotRecord } from "./types";

const ALL: ChangeSection[] = ["headline", "about", "experience", "education", "skills", "projects", "certifications", "organizations", "volunteering", "languages", "honors"];
const DAY = 24 * 60 * 60 * 1000;

const goal: GoalSnapshot = {
  id: "g1",
  name: "Software developers",
  criteria: [
    { id: "c1", label: "Software development", importance: "MUST_HAVE" },
    { id: "c2", label: "Cloud certification", importance: "PREFERRED" },
  ],
};

const profile: LinkedInProfile = {
  ...EMPTY_PROFILE,
  name: "Jordan Rivera",
  headline: "Software engineering student",
  experience: [{ title: "Software Engineer", company: "Acme", dates: "Jan 2026 - Present", description: "Built a staff dashboard" }],
  certifications: [],
  extracted: true,
};

function analysis(score: number, cloud: "missing" | "strong"): AnalysisSnapshot {
  return {
    matchScore: score,
    recommendation: "Worth contacting",
    summary: "Jordan builds software.",
    strengths: ["Software work"],
    gaps: [],
    criteria: [
      { id: "c1", label: "Software development", strength: "strong" },
      { id: "c2", label: "Cloud certification", strength: cloud },
    ],
    source: "ai",
  };
}

function record(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return { recordedAt: 0, origin: "saved", profile, completeSections: ALL, goal, analysis: analysis(72, "missing"), changes: [], ...overrides };
}

function saved(history: SnapshotRecord[] = [record()]): SavedProfile {
  return { profileKey: "jordan", profileName: "Jordan Rivera", profileUrl: "https://www.linkedin.com/in/jordan/", savedAt: 0, lastCheckedAt: 0, history, lastCheck: null, notes: "" };
}

const noSemantic = async () => new Map() as SemanticResults;

async function check(current: LinkedInProfile, options: { saved?: SavedProfile; now?: number; resolve?: (pairs: TextPair[]) => Promise<SemanticResults>; current?: AnalysisSnapshot } = {}) {
  return checkSavedProfile({
    saved: options.saved ?? saved(),
    profile: current,
    completeSections: ALL,
    goal,
    analysis: options.current ?? analysis(72, "missing"),
    now: options.now ?? 3 * DAY,
    resolve: options.resolve ?? noSemantic,
  });
}

describe("checkSavedProfile", () => {
  it("records nothing new for an unchanged profile", async () => {
    const { next, report } = await check(profile);
    expect(report.changes).toEqual([]);
    expect(next.history).toHaveLength(1);
    expect(next.lastCheckedAt).toBe(3 * DAY);
    expect(report.baselineRecordedAt).toBe(0);
  });

  it("ignores a paraphrase the semantic check says kept its meaning", async () => {
    const asked: TextPair[] = [];
    const { next, report } = await check(
      { ...profile, experience: [{ ...profile.experience[0]!, description: "Created a dashboard for staff" }] },
      { resolve: async (pairs) => (asked.push(...pairs), new Map(pairs.map((p) => [p.id, null]))) },
    );
    expect(asked).toHaveLength(1);
    expect(report.changes).toEqual([]);
    expect(next.history).toHaveLength(1);
    // The baseline keeps its own wording, so nothing drifts silently.
    expect(next.history[0]!.profile.experience[0]!.description).toBe("Built a staff dashboard");
  });

  it("reports new responsibility the semantic check found (test C)", async () => {
    const meaningful = (pair: TextPair): ProfileChange => ({ id: pair.id, kind: "text_changed", section: pair.section, significance: "meaningful", direction: "improved", title: "New responsibility", subject: pair.context, current: "allowing advisers to independently manage student content" });
    const current = { ...profile, experience: [{ ...profile.experience[0]!, description: "Built a staff dashboard allowing advisers to independently manage student content" }] };
    const { next, report } = await check(current, { resolve: async (pairs) => new Map(pairs.map((p) => [p.id, meaningful(p)])) });
    expect(report.changes).toMatchObject([{ title: "New responsibility", direction: "improved" }]);
    expect(next.history).toHaveLength(2);
    expect(next.history[0]!.changes).toHaveLength(1);
    // The old snapshot survives in history as the "before".
    expect(next.history[1]!.profile.experience[0]!.description).toBe("Built a staff dashboard");
  });

  it("counts edits it could not check, and keeps them to compare again", async () => {
    const { next, report } = await check({ ...profile, experience: [{ ...profile.experience[0]!, description: "Created a dashboard for staff" }] });
    expect(report.unchecked).toBe(1);
    expect(next.history[0]!.profile.experience[0]!.description).toBe("Built a staff dashboard");
  });

  it("compares previous and current Match and explains it only with grounded changes", async () => {
    const current = { ...profile, certifications: [{ name: "AWS Certified Cloud Practitioner" }] };
    const { report } = await check(current, { current: analysis(84, "strong") });
    expect(report.impact).toMatchObject({ previous: 72, current: 84, delta: 12, sameGoal: true });
    expect(report.impact.explanations).toEqual(["Cloud certification: evidence became stronger with new certification (AWS Certified Cloud Practitioner)."]);
  });

  it("does not compare Match across different goals", async () => {
    const other = saved([record({ goal: { id: "g2", name: "Product leaders", criteria: [] } })]);
    const { report } = await check(profile, { saved: other });
    expect(report.impact).toMatchObject({ delta: null, sameGoal: false, previousGoalName: "Product leaders" });
  });

  it("only fills in the snapshot during the visit that saved the person", async () => {
    const later = { ...profile, certifications: [{ name: "Found on a detail page" }] };
    const { next, report } = await check(later, { now: 5 * 60 * 1000 });
    expect(report.changes).toEqual([]);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]!.profile.certifications).toHaveLength(1);
  });

  it("redoes this visit's record against the one before it instead of stacking", async () => {
    const first = await check({ ...profile, certifications: [{ name: "AWS Certified Cloud Practitioner" }] });
    expect(first.next.history).toHaveLength(2);
    const second = await check({ ...profile, certifications: [{ name: "AWS Certified Cloud Practitioner" }], skills: ["Go"] }, { saved: first.next, now: 3 * DAY + VISIT_WINDOW_MS / 2 });
    expect(second.next.history).toHaveLength(2);
    expect(second.report.changes.map((c) => c.title)).toEqual(["New certification", "New skills"]);
    expect(second.report.baselineRecordedAt).toBe(0);
  });
});

describe("interpretForGoal", () => {
  const roleChange: ProfileChange = { id: "x", kind: "role_changed", section: "experience", significance: "major", direction: "changed", title: "Role changed", subject: "Product Manager at Acme", previous: "Software Engineer", current: "Product Manager" };

  it("keeps a role change neutral for a goal it does not touch, or weaker when it moves away", () => {
    expect(interpretForGoal(roleChange, null)).toBe("changed");
    expect(interpretForGoal({ ...roleChange, subject: "Acme" }, goal)).toBe("weaker");
  });

  it("reads the same role change as an improvement for a goal it serves", () => {
    const productGoal: GoalSnapshot = { id: "p", name: "Product leaders", criteria: [{ id: "p1", label: "Product management", importance: "MUST_HAVE" }] };
    expect(interpretForGoal({ ...roleChange, subject: "Acme" }, productGoal)).toBe("improved");
  });

  it("treats additions unrelated to the goal as changes, and excluded ones as weaker", () => {
    const added: ProfileChange = { id: "y", kind: "added", section: "honors", significance: "meaningful", direction: "improved", title: "New award", subject: "Poetry prize" };
    expect(interpretForGoal(added, goal)).toBe("changed");
    const excluding: GoalSnapshot = { ...goal, criteria: [...goal.criteria, { id: "c3", label: "Poetry", importance: "EXCLUDED" }] };
    expect(interpretForGoal(added, excluding)).toBe("weaker");
  });
});

describe("matchImpact", () => {
  it("never invents a cause for a criterion no change speaks to", () => {
    const impact = matchImpact(record(), goal, analysis(80, "strong"), []);
    expect(impact.explanations).toEqual(["Cloud certification: now assessed as stronger."]);
  });
});
