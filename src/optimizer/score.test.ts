import { describe, expect, it } from "vitest";
import { computeOptimizerScore, computeScoreBreakdown, missingRelevance, type ScoreEvidence } from "./score";
import { OPTIMIZER_SECTIONS, type SectionPresence } from "./sections";
import { evaluateChecklist, summarizeChecklist } from "./checklist";
import { EMPTY_PROFILE } from "../models/profile";
import type { OptimizerSection } from "./sections";
import type { SectionAssessmentDTO } from "./optimizerTypes";

const CORE = ["photo", "headline", "about", "experience", "education", "skills"] as OptimizerSection[];
const presence = (present: OptimizerSection[]): SectionPresence[] => OPTIMIZER_SECTIONS.map(({ section }) => ({ section, present: present.includes(section), itemCount: null, evidenceIds: [] }));
const assess = (section: OptimizerSection, state: SectionAssessmentDTO["state"], impact: SectionAssessmentDTO["impact"] = "medium"): SectionAssessmentDTO => ({ section, state, impact, reason: "r", sourceType: "linkedin_profile", evidenceIds: [], suggestions: [] });
const strong = CORE.map((s) => assess(s, "strong"));
const ev = (section: string, text: string, index = 0): ScoreEvidence => ({ id: `${section}:${index}`, section, text });

describe("score breakdown", () => {
  it("makes the total the sum of its sections, each with a status, weight, points, and reason", () => {
    const breakdown = computeScoreBreakdown(presence(CORE), strong);
    const counted = breakdown.sections.filter((s) => s.possible > 0);
    expect(counted.map((s) => s.section).sort()).toEqual([...CORE].sort());
    expect(counted.every((s) => s.status === "strong" && s.reason)).toBe(true);
    expect(breakdown.score).toBe(Math.round((100 * counted.reduce((n, s) => n + s.earned, 0)) / counted.reduce((n, s) => n + s.possible, 0)));
  });
});

describe("optional sections", () => {
  const school = [ev("education", "State University — BS"), ev("experience", "Cashier — Store — Ran the register.")];
  const publicWork = [ev("experience", "Web Developer — Club — Built a website used by 300+ students.")];
  const base = computeOptimizerScore(presence(CORE), strong, school);

  it("does not penalize a missing Featured section when nothing is worth showcasing", () => {
    expect(missingRelevance("featured", school)?.relevant).toBe(false);
    expect(computeOptimizerScore(presence(CORE), [...strong, assess("featured", "add", "high")], school)).toBe(base);
  });

  it("recommends Featured and Projects, with a score cost, when public project work exists elsewhere", () => {
    expect(missingRelevance("featured", publicWork)?.relevant).toBe(true);
    expect(missingRelevance("projects", publicWork)?.relevant).toBe(true);
    const breakdown = computeScoreBreakdown(presence(CORE), strong, publicWork);
    expect(breakdown.sections.find((s) => s.section === "featured")).toMatchObject({ status: "missing_relevant" });
    expect(breakdown.sections.find((s) => s.section === "projects")).toMatchObject({ status: "missing_relevant" });
    expect(breakdown.score).toBeLessThan(computeOptimizerScore(presence(CORE), strong, school));
  });
});

describe("manual overrides", () => {
  it("change a section's contribution and the final score through the same path", () => {
    const photoContext = (answers: Record<string, boolean>) => ({ profile: EMPTY_PROFILE, presence: { section: "photo" as const, present: true, itemCount: null, evidenceIds: [] }, evidence: [], answers });
    const ratio = (answers: Record<string, boolean>) => {
      const criteria = evaluateChecklist("photo", photoContext(answers), { status: "idle" });
      const { passed, verifiable } = summarizeChecklist(true, criteria);
      return { photo: { passed, verifiable } };
    };
    const failed = ratio({ "photo-face": false });
    const confirmed = ratio({ "photo-face": true });
    const score = (r: typeof failed) => computeScoreBreakdown(presence(CORE), [...strong.filter((a) => a.section !== "photo"), assess("photo", "improve")], undefined, r);
    expect(score(confirmed).sections.find((s) => s.section === "photo")!.earned).toBeGreaterThan(score(failed).sections.find((s) => s.section === "photo")!.earned);
    expect(score(confirmed).score).toBeGreaterThan(score(failed).score);
  });
});
