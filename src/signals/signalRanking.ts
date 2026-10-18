// Ranks graded evidence across the whole profile into what Signal Mode highlights and what Key
// Evidence lists. Deterministic: the same candidates, goal, and incumbents always give the same
// core. Grades come from the model (or the heuristic fallback); every decision is made here.
import type { GradeKey, Grades, SignalFactType, SignalSection } from "../ai/signalTypes";

export const SIGNAL_RANKING_VERSION = 4;

export interface RankCandidate {
  /** Stable across visits: the content hash of its item plus its normalized quote. */
  id: string;
  itemKey: string;
  evidenceId: string;
  section: SignalSection;
  /** The item's position in profile order, and the quote's position inside the item. */
  itemOrder: number;
  position: number;
  itemLength: number;
  quote: string;
  fact: string | null;
  type: SignalFactType;
  grades: Grades;
  goalRelevance: number;
  confidence: number;
  metrics: string[];
}

export type Band = "exceptional" | "strong" | "useful" | "supporting" | "weak";
export type RejectionReason =
  | "LOW_IMPORTANCE"
  | "LOW_CONFIDENCE"
  | "DUPLICATE_FACT"
  | "OVERLAP"
  | "SECTION_CAP"
  | "DENSITY_CAP"
  | "REDUNDANT"
  | "LOST_TO_STRONGER_EVIDENCE";

export interface ScoredCandidate extends RankCandidate {
  score: number;
  intrinsic: number;
  goalPart: number;
  band: Band;
}

export interface RankingDebugRecord {
  id: string;
  section: SignalSection;
  quote: string;
  type: SignalFactType;
  band: Band;
  score: number;
  intrinsic: number;
  goalPart: number;
  grades: Grades;
  goalRelevance: number;
  confidence: number;
  status: "core" | "discovery" | "pool" | "rejected";
  reason?: RejectionReason;
}

export interface RankingResult {
  core: ScoredCandidate[];
  discovery: ScoredCandidate[];
  /** Ranked facts for Key Evidence, from the same scoring as the highlights. */
  facts: { text: string; evidenceId: string }[];
  debug: RankingDebugRecord[];
}

export const EMPTY_RANKING: RankingResult = { core: [], discovery: [], facts: [], debug: [] };

export interface RankingOptions {
  goalActive: boolean;
  /** Core ids already on screen for this profile; a newcomer must clearly beat them to replace one. */
  incumbents?: ReadonlySet<string>;
  /** Picks which next-best candidates fill the discovery slots; fixed for one visit. */
  discoverySeed?: number;
}

// How much each grade says about a fact. Selection, outcomes, and distinctiveness count most;
// specificity alone helps little; genericness is a penalty, applied below.
const WEIGHTS: Record<Exclude<GradeKey, "genericness">, number> = {
  selectivity: 3.2,
  impact: 3.0,
  distinctiveness: 2.8,
  result: 2.6,
  leadership: 2.6,
  ownership: 2.2,
  scale: 2.2,
  technicalDepth: 2.0,
  sustainedDepth: 1.8,
  specificity: 1.2,
};
const WEIGHTED_KEYS = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];
const PEAK_KEYS = WEIGHTED_KEYS.filter((key) => key !== "specificity");
const WEIGHT_TOTAL = WEIGHTED_KEYS.reduce((sum, key) => sum + WEIGHTS[key], 0);

// Supporting kinds of evidence start lower: a course list or a skill name proves less than work.
const TYPE_FACTOR: Partial<Record<SignalFactType, number>> = {
  coursework: 0.65,
  skill: 0.5,
  membership: 0.6,
  self_description: 0.45,
  education: 0.8,
  language: 0.85,
  responsibility: 0.9,
  other: 0.9,
};
const TYPE_PRIORITY: SignalFactType[] = [
  "competition_result",
  "award",
  "measurable_impact",
  "selective_admission",
  "leadership_scope",
  "project_ownership",
  "technical_execution",
  "teaching_scope",
  "volunteering_impact",
  "sustained_training",
  "credential",
  "responsibility",
  "language",
  "education",
  "coursework",
  "membership",
  "skill",
  "self_description",
  "other",
];
const SECTION_ORDER: SignalSection[] = ["about", "experience", "projects", "honors", "education", "volunteering", "certifications", "organizations", "languages", "skills", "headline", "location"];

const GENERIC_PENALTY = 7;
// Intrinsic importance first; the goal adjusts it, and only for evidence with substance.
const GOAL_SHARE = 0.22;
const GOAL_SUBSTANCE = 25;
const MIN_CONFIDENCE = 0.35;
const INCUMBENT_BONUS = 6;
const REDUNDANCY_PENALTY = 18;
const SAME_TYPE_PENALTY = 2;
const DUPLICATE_SIMILARITY = 0.6;
const MAX_HIGHLIGHTS = 20;
const CORE_SHARE = 0.8;
const MAX_FACTS = 12;
const DENSITY_SHARE = 0.2;
const MIN_DENSITY_ALLOWANCE = 240;
const ITEM_SHARE = 0.5;
const MIN_ITEM_ALLOWANCE = 120;

const BAND_FLOORS: [Band, number][] = [
  ["exceptional", 58],
  ["strong", 44],
  ["useful", 30],
  ["supporting", 15],
];

export function bandFor(score: number): Band {
  return BAND_FLOORS.find(([, floor]) => score >= floor)?.[0] ?? "weak";
}

const atLeast = (band: Band, floor: Band) => BAND_ORDER.indexOf(band) <= BAND_ORDER.indexOf(floor);
const BAND_ORDER: Band[] = ["exceptional", "strong", "useful", "supporting", "weak"];

// Intrinsic importance blends breadth (all grades, weighted) with peak (the three strongest),
// so one standout dimension like a competition placement still counts.
export function scoreCandidate(candidate: Pick<RankCandidate, "grades" | "type" | "confidence" | "goalRelevance">, goalActive: boolean) {
  const g = candidate.grades;
  const breadth = WEIGHTED_KEYS.reduce((sum, key) => sum + WEIGHTS[key] * g[key], 0) / (3 * WEIGHT_TOTAL);
  const peak = PEAK_KEYS.map((key) => g[key] / 3)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, v) => sum + v, 0) / 3;
  const raw = 100 * (0.5 * breadth + 0.5 * peak) * (TYPE_FACTOR[candidate.type] ?? 1) - GENERIC_PENALTY * g.genericness;
  const intrinsic = Math.max(0, raw) * (0.55 + 0.45 * candidate.confidence);
  const goalPart = goalActive ? (candidate.goalRelevance / 3) * 100 * Math.min(1, intrinsic / GOAL_SUBSTANCE) : 0;
  const score = goalActive ? (1 - GOAL_SHARE) * intrinsic + GOAL_SHARE * goalPart : intrinsic;
  return { intrinsic: round(intrinsic), goalPart: round(goalPart), score: round(score) };
}

const round = (n: number) => Math.round(n * 10) / 10;

const STOPWORDS = new Set("a an and the of for to in on at by with from as is was were be my our their his her its this that i we".split(" "));

function signature(candidate: RankCandidate): Set<string> {
  const words = (candidate.fact ?? candidate.quote).toLowerCase().match(/[\p{L}\d+]+/gu) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)).map((w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w)));
}

// Jaccard overlap of content words: a restatement of the same fact scores high, two facts that
// merely share a verb ("Taught robotics classes", "Taught piano classes") do not.
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  // Facts stating different numbers are different facts, however alike their words.
  const numbers = (s: Set<string>) => [...s].filter((w) => /\d/.test(w));
  const [na, nb] = [numbers(a), numbers(b)];
  if (na.length > 0 && nb.length > 0 && !na.some((n) => nb.includes(n))) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared / (a.size + b.size - shared);
}

// Two statements of the same long training ("9 years of studying", "Over 9 years, I acquired")
// are one fact however differently they are worded.
function sameTraining(a: RankCandidate, aSig: Set<string>, b: RankCandidate, bSig: Set<string>): boolean {
  if (a.type !== "sustained_training" || b.type !== "sustained_training") return false;
  return [...aSig].some((w) => /\d/.test(w) && bSig.has(w));
}

const normalized = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

function overlaps(a: RankCandidate, b: RankCandidate): boolean {
  if (a.itemKey !== b.itemKey) return false;
  const aEnd = a.position + a.quote.length;
  const bEnd = b.position + b.quote.length;
  return a.position < bEnd && b.position < aEnd;
}

// Total order: score, confidence, kind of evidence, section, then where it sits, then id.
function compare(a: ScoredCandidate, b: ScoredCandidate, bonus: (c: ScoredCandidate) => number): number {
  return (
    b.score + bonus(b) - (a.score + bonus(a)) ||
    b.confidence - a.confidence ||
    TYPE_PRIORITY.indexOf(a.type) - TYPE_PRIORITY.indexOf(b.type) ||
    SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
    a.itemOrder - b.itemOrder ||
    a.position - b.position ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

// Per-item limits keep one dense entry from taking every highlight; zero is always allowed.
function itemCap(candidate: ScoredCandidate, strongInItem: number): number {
  switch (candidate.section) {
    case "experience":
    case "projects":
      return strongInItem >= 4 && candidate.itemLength >= 700 ? 4 : 3;
    case "about":
      return 3;
    case "education":
    case "volunteering":
    case "honors":
      return 2;
    case "skills":
      return candidate.band === "exceptional" ? 1 : 0;
    default:
      return 1;
  }
}

const MIN_CORE = 4;
const SUPPORTING_TYPES = new Set<SignalFactType>(["coursework", "skill", "membership", "self_description"]);

const SECTION_CAPS: Partial<Record<SignalSection, number>> = { languages: 2, skills: 1, certifications: 3, honors: 4 };

function budgetFor(kept: ScoredCandidate[]): number {
  const count = (band: Band) => kept.filter((c) => c.band === band).length;
  let budget = count("exceptional") + count("strong") + Math.ceil(count("useful") * 0.6);
  // Supporting evidence fills in only when the profile has little else and it matters to the goal.
  if (budget < 4) budget += Math.min(2, kept.filter((c) => c.band === "supporting" && c.goalRelevance >= 2).length);
  return Math.min(MAX_HIGHLIGHTS, budget);
}

export function rankSignals(candidates: RankCandidate[], options: RankingOptions): RankingResult {
  const incumbents = options.incumbents ?? new Set<string>();
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const parts = scoreCandidate(c, options.goalActive);
    return { ...c, ...parts, band: bandFor(parts.score) };
  });
  const status = new Map<string, Pick<RankingDebugRecord, "status" | "reason">>();
  const reject = (c: ScoredCandidate, reason: RejectionReason) => status.set(c.id, { status: "rejected", reason });
  const bonus = (c: ScoredCandidate) => (incumbents.has(c.id) ? INCUMBENT_BONUS : 0);
  const ordered = [...scored].sort((a, b) => compare(a, b, bonus));

  // One representation per fact, across the whole profile: the strongest wording wins.
  const kept: ScoredCandidate[] = [];
  const signatures = new Map<string, Set<string>>();
  for (const candidate of ordered) {
    if (candidate.confidence < MIN_CONFIDENCE) {
      reject(candidate, "LOW_CONFIDENCE");
      continue;
    }
    if (candidate.band === "weak") {
      reject(candidate, "LOW_IMPORTANCE");
      continue;
    }
    const sig = signature(candidate);
    const overlapping = kept.find((k) => overlaps(k, candidate));
    if (overlapping) {
      reject(candidate, "OVERLAP");
      continue;
    }
    const duplicate = kept.find((k) => normalized(k.quote) === normalized(candidate.quote) || similarity(signatures.get(k.id)!, sig) >= DUPLICATE_SIMILARITY || sameTraining(k, signatures.get(k.id)!, candidate, sig));
    if (duplicate) {
      reject(candidate, "DUPLICATE_FACT");
      continue;
    }
    signatures.set(candidate.id, sig);
    kept.push(candidate);
  }

  const budget = budgetFor(kept);
  const coreTarget = Math.round(budget * CORE_SHARE);
  const discoveryTarget = budget - coreTarget;
  const totalText = [...new Map(candidates.map((c) => [c.itemKey, c.itemLength])).values()].reduce((a, b) => a + b, 0);
  const densityAllowance = Math.max(MIN_DENSITY_ALLOWANCE, totalText * DENSITY_SHARE);
  const strongPerItem = new Map<string, number>();
  for (const c of kept) if (atLeast(c.band, "strong")) strongPerItem.set(c.itemKey, (strongPerItem.get(c.itemKey) ?? 0) + 1);

  // Greedy selection with marginal value: a fact that repeats what is already chosen counts for less.
  function choose(pool: ScoredCandidate[], chosen: ScoredCandidate[], count: number, reasons: boolean): ScoredCandidate[] {
    const picked: ScoredCandidate[] = [];
    const remaining = [...pool];
    while (picked.length < count && remaining.length > 0) {
      const all = [...chosen, ...picked];
      let best = -1;
      let bestValue = -Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const c = remaining[i]!;
        const sig = signatures.get(c.id)!;
        const redundancy = all.reduce((max, s) => Math.max(max, similarity(signatures.get(s.id)!, sig)), 0);
        const value = c.score + bonus(c) - REDUNDANCY_PENALTY * redundancy - SAME_TYPE_PENALTY * all.filter((s) => s.type === c.type).length;
        if (value > bestValue) {
          bestValue = value;
          best = i;
        }
      }
      const candidate = remaining.splice(best, 1)[0]!;
      const sameItem = all.filter((s) => s.itemKey === candidate.itemKey);
      const sameSection = all.filter((s) => s.section === candidate.section);
      const chars = all.reduce((sum, s) => sum + s.quote.length, 0);
      const itemChars = sameItem.reduce((sum, s) => sum + s.quote.length, 0);
      let reason: RejectionReason | null = null;
      if (sameItem.length >= itemCap(candidate, strongPerItem.get(candidate.itemKey) ?? 0) || sameSection.length >= (SECTION_CAPS[candidate.section] ?? Infinity)) reason = "SECTION_CAP";
      else if (chars + candidate.quote.length > densityAllowance || itemChars + candidate.quote.length > Math.max(MIN_ITEM_ALLOWANCE, candidate.itemLength * ITEM_SHARE)) reason = "DENSITY_CAP";
      if (reason) {
        if (reasons) reject(candidate, reason);
        continue;
      }
      picked.push(candidate);
    }
    return picked;
  }

  // Core is the profile's top evidence. Merely useful or supporting kinds of evidence (coursework,
  // skills, memberships) join it only when the profile is too sparse to fill it otherwise.
  const strongEnough = kept.filter((c) => atLeast(c.band, "strong") && !SUPPORTING_TYPES.has(c.type));
  const core = choose(strongEnough, [], coreTarget, true);
  if (core.length < MIN_CORE) core.push(...choose(kept.filter((c) => !core.includes(c)), core, Math.min(coreTarget, MIN_CORE) - core.length, true));
  const sparse = core.length < MIN_CORE;
  const rest = kept.filter((c) => !core.includes(c) && (sparse || !SUPPORTING_TYPES.has(c.type)));
  const pool = choose(rest, core, discoveryTarget * 2, false);
  const seed = Math.abs(Math.trunc(options.discoverySeed ?? 0));
  const offset = pool.length > 0 ? seed % pool.length : 0;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
  const discovery = choose(rotated, core, discoveryTarget, false).sort((a, b) => compare(a, b, bonus));

  for (const c of core) status.set(c.id, { status: "core" });
  for (const c of discovery) status.set(c.id, { status: "discovery" });
  for (const c of pool) if (!status.has(c.id)) status.set(c.id, { status: "pool" });
  for (const c of kept) if (!status.has(c.id)) status.set(c.id, { status: "rejected", reason: atLeast(c.band, "useful") ? "REDUNDANT" : "LOST_TO_STRONGER_EVIDENCE" });

  const facts = kept
    .filter((c) => c.fact && atLeast(c.band, "useful"))
    .slice(0, MAX_FACTS)
    .map((c) => ({ text: c.fact!, evidenceId: c.evidenceId }));

  const debug = ordered.map((c) => ({
    id: c.id,
    section: c.section,
    quote: c.quote,
    type: c.type,
    band: c.band,
    score: c.score,
    intrinsic: c.intrinsic,
    goalPart: c.goalPart,
    grades: c.grades,
    goalRelevance: c.goalRelevance,
    confidence: c.confidence,
    ...(status.get(c.id) ?? { status: "rejected" as const, reason: "LOW_IMPORTANCE" as const }),
  }));

  return { core, discovery, facts, debug };
}
