// Ranks graded claims into two different answers from one set of claims:
// - Key Evidence: the strongest facts on the whole profile. Global, selective, by importance.
// - Inline highlighting: what to emphasize so each description can be skimmed. Core is the
//   profile's strongest evidence; the reading layer then adds, entry by entry, the concrete
//   phrases a skimmer needs (what was done, built, reached), judged mostly by reading value.
// Deterministic: the same claims, goal, and incumbents always give the same result. How a chosen
// claim looks (its colors) is decided later and never feeds back here. Grades come from the model
// (or the heuristic fallback); every decision is made here.
import type { GradeKey, Grades, SemanticLabel, SignalFactType, SignalSection } from "../ai/signalTypes";
import { fallbackEvidence } from "./heuristicGrades";

export const SIGNAL_RANKING_VERSION = 8;

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
  /** 0-3: how much highlighting the phrase helps someone skim its item; derived when absent. */
  readingValue?: number;
  confidence: number;
  metrics: string[];
  /** A sentence's central claim, or a clause that supports one; main when absent. */
  claim?: "main" | "support";
  /** Claims about one event share a group within their item. */
  group?: number;
  labels?: SemanticLabel[];
  /** Which sentence of its item the quote starts in. */
  sentence?: number;
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
  | "LOST_TO_STRONGER_EVIDENCE"
  | "LOW_READING_VALUE";
/** Why a main claim with a Key Evidence line is not listed. */
export type KeyEvidenceReason = "LOW_KEY_EVIDENCE_VALUE" | "GLOBAL_KEY_EVIDENCE_CUTOFF" | "ENTRY_ALREADY_LISTED" | "REDUNDANT" | "NO_LINE" | "SUPPORT";

export interface ScoredCandidate extends RankCandidate {
  /** Importance: what Key Evidence and core are chosen by. */
  score: number;
  /** Reading value: what the reading layer of inline highlighting is chosen by. */
  reading: number;
  intrinsic: number;
  goalPart: number;
  band: Band;
}

export interface RankingDebugRecord {
  id: string;
  section: SignalSection;
  quote: string;
  /** The Key Evidence line written for it, if any. */
  fact: string | null;
  type: SignalFactType;
  band: Band;
  score: number;
  reading: number;
  intrinsic: number;
  goalPart: number;
  grades: Grades;
  goalRelevance: number;
  confidence: number;
  claim: "main" | "support";
  group: string;
  labels: SemanticLabel[];
  sentence: number;
  status: "core" | "discovery" | "reading" | "pool" | "rejected";
  reason?: RejectionReason;
  /** Highlighted inline (core, discovery, or reading). */
  inline: boolean;
  keyEvidence: boolean;
  keyReason?: KeyEvidenceReason;
}

export interface RankingResult {
  core: ScoredCandidate[];
  discovery: ScoredCandidate[];
  /** Concrete phrases added so each description can be skimmed; stable like core. */
  reading: ScoredCandidate[];
  /** Ranked facts for Key Evidence: the strongest main claims across the whole profile. */
  facts: { text: string; evidenceId: string }[];
  debug: RankingDebugRecord[];
}

export const EMPTY_RANKING: RankingResult = { core: [], discovery: [], reading: [], facts: [], debug: [] };

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
  "distinction",
  "milestone",
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
// A claim that adds a kind of evidence its item does not show yet tells the reader more.
const NEW_LABEL_BONUS = 3;
// A main claim brings up to two of its supporting clauses, if they carry evidence of their own.
const MAX_SUPPORTS = 2;
const SUPPORT_SLACK = 1.2;
const DUPLICATE_SIMILARITY = 0.6;
const MAX_HIGHLIGHTS = 22;
const CORE_SHARE = 0.8;
// Key Evidence takes strong and exceptional facts; merely useful ones only top up a profile that has
// fewer strong facts than this, so the list is never padded with mediocre evidence.
const MAX_FACTS = 10;
const MIN_KEY_EVIDENCE = 4;
const KEY_DUPLICATE_SIMILARITY = 0.4;
// An entry is usually one experience, so it gets one line; About is free prose that can hold
// several. A long entry may give a second line, but only for an exceptional claim the model marked
// as a separate event (its own group); claims without groups never split an entry.
const LONG_ENTRY = 400;
// An award, certificate, or language is one achievement however long its description is.
const MULTI_EVENT_SECTIONS = new Set<SignalSection>(["experience", "education", "volunteering", "projects"]);
function entryHasRoom(c: ScoredCandidate, listed: ScoredCandidate[]): boolean {
  const same = listed.filter((k) => k.itemKey === c.itemKey);
  if (c.section === "about") return same.length < 2;
  if (same.length === 0) return true;
  const first = same[0]!;
  return same.length === 1 && MULTI_EVENT_SECTIONS.has(c.section) && c.itemLength >= LONG_ENTRY && c.band === "exceptional" && c.group !== undefined && first.group !== undefined && first.group !== c.group;
}
const DENSITY_SHARE = 0.25;
const MIN_DENSITY_ALLOWANCE = 400;
const ITEM_SHARE = 0.55;
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

// Milestones, credentials, completions, selections, and distinctions matter as events in a
// person's path, which the grades alone (impact, ownership, scale, ...) cannot say. This is an
// importance input read from what the claim is, never from how it would be colored.
const SIGNIFICANT_KINDS = new Set<string>(["milestone", "credential", "completion", "selectivity", "distinction", "achievement", "selective_admission", "competition_result", "award"]);
const SIGNIFICANCE_WEIGHT = 2.4;

export function significance(candidate: Pick<RankCandidate, "type" | "labels">): number {
  return SIGNIFICANT_KINDS.has(candidate.type) || (candidate.labels ?? []).some((l) => SIGNIFICANT_KINDS.has(l)) ? 3 : 0;
}

// Intrinsic importance blends breadth (all grades, weighted) with peak (the three strongest),
// so one standout dimension like a competition placement still counts.
export function scoreCandidate(candidate: Pick<RankCandidate, "grades" | "type" | "confidence" | "goalRelevance" | "labels">, goalActive: boolean) {
  const g = candidate.grades;
  const sig = significance(candidate);
  const breadth = (WEIGHTED_KEYS.reduce((sum, key) => sum + WEIGHTS[key] * g[key], 0) + SIGNIFICANCE_WEIGHT * sig) / (3 * (WEIGHT_TOTAL + SIGNIFICANCE_WEIGHT));
  const peak = [...PEAK_KEYS.map((key) => g[key] / 3), sig / 3]
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

// The model grades reading value directly. Grades without it (the heuristic fallback) derive it:
// a concrete phrase about what the person did reads well, a generic one does not.
export function readingGrade(candidate: Pick<RankCandidate, "readingValue" | "grades">): number {
  if (candidate.readingValue !== undefined) return candidate.readingValue;
  const g = candidate.grades;
  const concrete = Math.max(g.ownership, g.technicalDepth, g.result, g.scale, g.leadership, g.selectivity, g.sustainedDepth);
  return Math.max(0, Math.min(3, Math.round((g.specificity + concrete) / 2) - (g.genericness >= 2 ? 1 : 0)));
}

// Self-descriptions and bare skill names say little to a skimmer however they are graded.
const READING_TYPE_FACTOR: Partial<Record<SignalFactType, number>> = { self_description: 0.4, skill: 0.6, membership: 0.75, coursework: 0.85 };
const READING_GENERIC_PENALTY = 10;

// Reading value leads, importance adds to it: a concrete duty ("Maintain the website throughout the
// school year") reads well though it is no trophy, and filler never reads well however it scores.
export function readingScore(candidate: Pick<RankCandidate, "readingValue" | "grades" | "type">, importance: number): number {
  const reading = readingGrade(candidate) / 3;
  const weight = Math.min(1, importance / BAND_FLOORS[1]![1]);
  const raw = 100 * (0.65 * reading + 0.35 * weight) * (READING_TYPE_FACTOR[candidate.type] ?? 1) - READING_GENERIC_PENALTY * Math.max(0, candidate.grades.genericness - 1);
  return round(Math.max(0, raw));
}

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

const PROSE_SECTIONS = new Set<SignalSection>(["about", "experience", "education", "projects", "volunteering", "honors"]);
const CHARS_PER_CLAIM = 130;
// About and Education are where a person's story is told in prose rather than in bullets.
const NARRATIVE_SECTIONS = new Set<SignalSection>(["about", "education"]);
const COVERAGE_MIN_LENGTH = 200;
const MAX_COVERAGE = 4;
// One claim for a short paragraph, two once it is a real narrative.
const coverageClaims = (itemLength: number) => (itemLength >= 400 ? 2 : 1);

// How many main claims one item may show. Prose scales with its length whatever the section, so a
// long Education narrative is never held to fewer claims than an Experience bullet list. Zero is
// always allowed: the importance floor still decides whether any are shown at all.
export function itemCap(candidate: Pick<ScoredCandidate, "section" | "itemLength" | "band">): number {
  if (PROSE_SECTIONS.has(candidate.section)) return Math.min(8, Math.max(2, Math.ceil(candidate.itemLength / CHARS_PER_CLAIM)));
  if (candidate.section === "skills") return candidate.band === "exceptional" ? 1 : 0;
  return 1;
}

const groupOf = (c: Pick<RankCandidate, "itemKey" | "group" | "id">) => (c.group === undefined ? c.id : `${c.itemKey}#${c.group}`);
const isSupport = (c: Pick<RankCandidate, "claim">) => c.claim === "support";

const MIN_CORE = 4;
const SUPPORTING_TYPES = new Set<SignalFactType>(["coursework", "skill", "membership", "self_description"]);

const SECTION_CAPS: Partial<Record<SignalSection, number>> = { languages: 2, skills: 1, certifications: 3, honors: 4 };

// The reading layer. Local, not global: a phrase earns its highlight inside its own entry, whatever
// the rest of the profile holds. Density adapts to the text: a long, dense description gets enough
// highlights to be read from them alone, a thin one gets few or none, and no entry is ever more
// than about two-fifths highlighted.
export const READING_FLOOR = 45;
const READING_SECTIONS = new Set<SignalSection>(["about", "experience", "education", "projects", "volunteering", "honors", "certifications", "organizations"]);
const READING_CHARS_PER_CLAIM = 110;
const MAX_READING_PER_ITEM = 8;
const READING_ITEM_SHARE = 0.42;
export function readingCap(candidate: Pick<RankCandidate, "section" | "itemLength">): number {
  if (!READING_SECTIONS.has(candidate.section)) return 0;
  if (!PROSE_SECTIONS.has(candidate.section)) return 1;
  return Math.min(MAX_READING_PER_ITEM, Math.max(1, Math.ceil(candidate.itemLength / READING_CHARS_PER_CLAIM)));
}

function budgetFor(kept: ScoredCandidate[]): number {
  const count = (band: Band) => kept.filter((c) => c.band === band && !isSupport(c)).length;
  let budget = count("exceptional") + count("strong") + Math.ceil(count("useful") * 0.6);
  // Supporting evidence fills in only when the profile has little else and it matters to the goal.
  if (budget < 4) budget += Math.min(2, kept.filter((c) => c.band === "supporting" && c.goalRelevance >= 2).length);
  return Math.min(MAX_HIGHLIGHTS, budget);
}

export function rankSignals(candidates: RankCandidate[], options: RankingOptions): RankingResult {
  const incumbents = options.incumbents ?? new Set<string>();
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const parts = scoreCandidate(c, options.goalActive);
    return { ...c, ...parts, reading: readingScore(c, parts.score), band: bandFor(parts.score) };
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
    // Weak importance ends a claim's chances unless it reads well: then it may still help skimming.
    if (candidate.band === "weak" && candidate.reading < READING_FLOOR) {
      reject(candidate, candidate.reading > 0 ? "LOW_READING_VALUE" : "LOW_IMPORTANCE");
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
  const mains = kept.filter((c) => !isSupport(c));
  // Supporting clauses ride with their main claim: never shown without it, never ahead of it.
  const attached: ScoredCandidate[] = [];
  // slack lets supporting context run slightly past the limit that main claims are held to.
  function fitsDensity(candidate: ScoredCandidate, shown: ScoredCandidate[], slack = 1): boolean {
    const chars = shown.reduce((sum, s) => sum + s.quote.length, 0);
    const itemChars = shown.filter((s) => s.itemKey === candidate.itemKey).reduce((sum, s) => sum + s.quote.length, 0);
    return chars + candidate.quote.length <= densityAllowance * slack && itemChars + candidate.quote.length <= Math.max(MIN_ITEM_ALLOWANCE, candidate.itemLength * ITEM_SHARE) * slack;
  }
  // The reading layer's limit: a share of the entry itself, whatever the rest of the profile holds.
  function fitsReading(candidate: ScoredCandidate, shown: ScoredCandidate[]): boolean {
    const itemChars = shown.filter((s) => s.itemKey === candidate.itemKey).reduce((sum, s) => sum + s.quote.length, 0);
    return itemChars + candidate.quote.length <= Math.max(MIN_ITEM_ALLOWANCE, candidate.itemLength * READING_ITEM_SHARE);
  }
  // Supports are attached last, once every main claim is settled, strongest first across the whole
  // profile, so a long supporting clause never takes the room of a stronger main claim.
  function attachSupports(mainsShown: ScoredCandidate[]): ScoredCandidate[] {
    const groups = new Set(mainsShown.map(groupOf));
    const perGroup = new Map<string, number>();
    const eligible = kept.filter((c) => isSupport(c) && groups.has(groupOf(c)) && (atLeast(c.band, "useful") || c.reading >= READING_FLOOR)).sort((a, b) => compare(a, b, bonus));
    for (const support of eligible) {
      const used = perGroup.get(groupOf(support)) ?? 0;
      const shown = [...mainsShown, ...attached];
      if (used >= MAX_SUPPORTS || !(fitsDensity(support, shown, SUPPORT_SLACK) || fitsReading(support, shown))) continue;
      perGroup.set(groupOf(support), used + 1);
      attached.push(support);
    }
    return attached;
  }

  // Greedy selection of main claims with marginal value: a claim that repeats what is already
  // chosen counts for less, one that adds a new kind of evidence to its item counts for more.
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
        const itemLabels = new Set(all.filter((s) => s.itemKey === c.itemKey).flatMap((s) => s.labels ?? []));
        const novelty = (c.labels ?? []).filter((l) => !itemLabels.has(l)).length;
        const value = c.score + bonus(c) - REDUNDANCY_PENALTY * redundancy - SAME_TYPE_PENALTY * all.filter((s) => s.type === c.type).length + NEW_LABEL_BONUS * novelty;
        if (value > bestValue) {
          bestValue = value;
          best = i;
        }
      }
      const candidate = remaining.splice(best, 1)[0]!;
      const sameItem = all.filter((s) => s.itemKey === candidate.itemKey);
      const sameSection = all.filter((s) => s.section === candidate.section);
      let reason: RejectionReason | null = null;
      if (sameItem.length >= itemCap(candidate) || sameSection.length >= (SECTION_CAPS[candidate.section] ?? Infinity)) reason = "SECTION_CAP";
      else if (!fitsDensity(candidate, [...all, ...attached])) reason = "DENSITY_CAP";
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
  const strongEnough = mains.filter((c) => atLeast(c.band, "strong") && !SUPPORTING_TYPES.has(c.type));
  const coreMains = choose(strongEnough, [], coreTarget, true);
  if (coreMains.length < MIN_CORE) coreMains.push(...choose(mains.filter((c) => !coreMains.includes(c)), coreMains, Math.min(coreTarget, MIN_CORE) - coreMains.length, true));

  // Narrative coverage, before any rotating extras: a long prose item (an About, an Education
  // story) whose claims all fell just under the cut still shows its best real ones, so its story is
  // never invisible. Self-description and weak claims still never qualify.
  const coverage: ScoredCandidate[] = [];
  const shownMains = () => [...coreMains, ...coverage];
  const byItem = new Map<string, ScoredCandidate[]>();
  for (const c of mains) if (NARRATIVE_SECTIONS.has(c.section) && c.itemLength >= COVERAGE_MIN_LENGTH) byItem.set(c.itemKey, [...(byItem.get(c.itemKey) ?? []), c]);
  for (const [itemKey, claims] of [...byItem].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const shown = shownMains().filter((c) => c.itemKey === itemKey).length;
    const wanted = coverageClaims(claims[0]!.itemLength);
    if (shown >= wanted) continue;
    const extra = claims
      .filter((c) => !shownMains().includes(c) && !SUPPORTING_TYPES.has(c.type) && atLeast(c.band, "supporting"))
      .sort((a, b) => compare(a, b, bonus))
      .slice(0, wanted - shown);
    for (const c of extra) if (coverage.length < MAX_COVERAGE && fitsDensity(c, shownMains())) coverage.push(c);
  }

  const sparse = coreMains.length < MIN_CORE;
  const rest = mains.filter((c) => !coreMains.includes(c) && !coverage.includes(c) && c.band !== "weak" && (sparse || !SUPPORTING_TYPES.has(c.type)));
  const pool = choose(rest, shownMains(), discoveryTarget * 2, false);
  const seed = Math.abs(Math.trunc(options.discoverySeed ?? 0));
  const offset = pool.length > 0 ? seed % pool.length : 0;
  const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
  const discoveryMains = choose(rotated, shownMains(), discoveryTarget, false).sort((a, b) => compare(a, b, bonus));

  // Reading layer: entry by entry, the concrete phrases that let it be skimmed, best reading value
  // first. Core and discovery already shown in the entry count toward its room.
  const readingMains: ScoredCandidate[] = [];
  const inlineMains = () => [...shownMains(), ...discoveryMains, ...readingMains];
  // A course list or a membership reads easily but tells little: it needs some importance too.
  const readable = mains
    .filter((c) => !inlineMains().includes(c) && c.reading >= READING_FLOOR && !(SUPPORTING_TYPES.has(c.type) && c.band === "weak"))
    .sort((a, b) => b.reading - a.reading || compare(a, b, bonus));
  for (const c of readable) {
    const sameItem = inlineMains().filter((s) => s.itemKey === c.itemKey);
    if (sameItem.length >= readingCap(c)) reject(c, "SECTION_CAP");
    else if (!fitsReading(c, sameItem)) reject(c, "DENSITY_CAP");
    else readingMains.push(c);
  }
  const supports = attachSupports([...shownMains(), ...discoveryMains, ...readingMains]);
  const inCore = new Set(coreMains.map(groupOf));

  const core = [...coreMains, ...supports.filter((s) => inCore.has(groupOf(s)))];
  const discovery = [...discoveryMains, ...coverage, ...supports.filter((s) => !inCore.has(groupOf(s)))];

  for (const c of core) status.set(c.id, { status: "core" });
  for (const c of discovery) status.set(c.id, { status: "discovery" });
  for (const c of readingMains) status.set(c.id, { status: "reading" });
  for (const c of pool) if (!status.has(c.id)) status.set(c.id, { status: "pool" });
  for (const c of kept) if (!status.has(c.id)) status.set(c.id, { status: "rejected", reason: atLeast(c.band, "useful") ? "REDUNDANT" : c.reading < READING_FLOOR ? "LOW_READING_VALUE" : "LOST_TO_STRONGER_EVIDENCE" });

  const { chosen: keyEvidence, reasons: keyReasons } = selectKeyEvidence(kept);
  const facts = keyEvidence.map((c) => ({ text: withSupportNumbers(keyLine(c)!, c, kept), evidenceId: c.evidenceId }));
  const inline = new Set([...core, ...discovery, ...readingMains].map((c) => c.id));
  const listed = new Set(keyEvidence.map((c) => c.id));

  const debug = ordered.map((c) => ({
    id: c.id,
    section: c.section,
    quote: c.quote,
    fact: c.fact,
    type: c.type,
    band: c.band,
    score: c.score,
    intrinsic: c.intrinsic,
    goalPart: c.goalPart,
    grades: c.grades,
    goalRelevance: c.goalRelevance,
    confidence: c.confidence,
    claim: c.claim ?? ("main" as const),
    group: groupOf(c),
    labels: c.labels ?? [],
    sentence: c.sentence ?? 0,
    reading: c.reading,
    inline: inline.has(c.id),
    keyEvidence: listed.has(c.id),
    keyReason: listed.has(c.id) ? undefined : (keyReasons.get(c.id) ?? (isSupport(c) ? "SUPPORT" : !keyLine(c) ? "NO_LINE" : "LOW_KEY_EVIDENCE_VALUE")),
    ...(status.get(c.id) ?? { status: "rejected" as const, reason: "LOW_IMPORTANCE" as const }),
  }));

  return { core, discovery, reading: readingMains, facts, debug };
}

// The model's line, or for a strong claim whose line was rejected, the claim's own words when they
// already read as a complete action ("Earned 2nd place at the TSA Regional Conference"), so a top
// fact never drops out of Key Evidence only because its wording failed validation.
function keyLine(c: ScoredCandidate): string | null {
  return c.fact ?? (!isSupport(c) && atLeast(c.band, "strong") ? fallbackEvidence(c.quote) : null);
}

// The model usually folds a claim's supporting clauses into its line, but not always: when the
// line leaves out a number that a support of the same event states ("a program intended for
// students aged 18 and older"), that clause is added in its exact source words, if the line stays
// within the Key Evidence length.
const NUMBER_TOKEN = /\d[\d,.]*\+?/g;
const MAX_KEY_WORDS = 32;
function withSupportNumbers(line: string, main: ScoredCandidate, kept: ScoredCandidate[]): string {
  const supports = kept.filter((s) => isSupport(s) && s.itemKey === main.itemKey && main.group !== undefined && s.group === main.group).sort((a, b) => b.score - a.score);
  for (const s of supports) {
    const numbers = s.quote.match(NUMBER_TOKEN) ?? [];
    if (numbers.length === 0 || numbers.every((n) => line.includes(n.replace(/\+$/, "")))) continue;
    const clause = /^\p{Lu}\p{Ll}/u.test(s.quote) ? s.quote.charAt(0).toLowerCase() + s.quote.slice(1) : s.quote;
    const joined = `${line}; ${clause}`;
    return joined.split(/\s+/).length <= MAX_KEY_WORDS ? joined : line;
  }
  return line;
}

// Key Evidence: the strongest facts across the whole profile, by importance alone. No section is
// owed a line, a support never gets its own (its main claim's line carries it), an entry gives one
// line (About two), and one fact told twice is listed once. Strong and exceptional facts qualify;
// useful ones only top up a profile with too few of them.
function selectKeyEvidence(kept: ScoredCandidate[]): { chosen: ScoredCandidate[]; reasons: Map<string, KeyEvidenceReason> } {
  const reasons = new Map<string, KeyEvidenceReason>();
  const eligible = kept.filter((c) => keyLine(c) && !isSupport(c) && atLeast(c.band, "useful"));
  const strong = eligible.filter((c) => atLeast(c.band, "strong"));
  const topUp = Math.max(0, MIN_KEY_EVIDENCE - strong.length);
  const useful = eligible.filter((c) => !strong.includes(c) && !SUPPORTING_TYPES.has(c.type));
  for (const c of useful.slice(topUp)) reasons.set(c.id, "LOW_KEY_EVIDENCE_VALUE");
  // A claim is judged with its group: a website whose scale sits in a supporting clause ("for a
  // 4,000+ student school") is as strong as that clause, and its line carries it.
  const groupScore = (c: ScoredCandidate) => Math.max(c.score, ...kept.filter((s) => isSupport(s) && s.itemKey === c.itemKey && c.group !== undefined && s.group === c.group).map((s) => s.score));
  const pool = [...strong, ...useful.slice(0, topUp)].sort((a, b) => groupScore(b) - groupScore(a));
  const chosen: ScoredCandidate[] = [];
  for (const c of pool) {
    if (!entryHasRoom(c, chosen)) reasons.set(c.id, "ENTRY_ALREADY_LISTED");
    else if (chosen.some((k) => similarity(signature(k), signature(c)) >= KEY_DUPLICATE_SIMILARITY)) reasons.set(c.id, "REDUNDANT");
    else if (chosen.length >= MAX_FACTS) reasons.set(c.id, "GLOBAL_KEY_EVIDENCE_CUTOFF");
    else chosen.push(c);
  }
  return { chosen, reasons };
}
