import { SignalAnalysisController, type SignalAnalysisState } from "../ai/signalAnalysisController";
import type { InlineHighlightDTO } from "../ai/signalTypes";
import type { LinkedInProfile } from "../models/profile";
import { SignalHighlighter } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";
import { profileIdentityKey } from "./profileAdapter";
import type { PanelProfileData } from "./panel/panelStore";
import { DEFAULT_HIGHLIGHT_PREFERENCES, isMeaningfulMetric, type PhraseCategory, type HighlightCategory, type HighlightPreferences } from "../signals/highlightCategories";
import { skillTerms, skillsIn } from "../signals/skillTerms";
import { skillGroups, type SkillGroup } from "../signals/skillLists";
import { buildEvidencePayload } from "../ai/evidencePayload";
import { sentenceIndex } from "../signals/signalPlan";
import type { RankingResult } from "../signals/signalRanking";

export const INLINE_MIN_IMPORTANCE = 0.5;

export interface SignalTickInput {
  /** Run the analysis: Signal Mode is on, or Profile Analyzer is open to show its Key Evidence. */
  enabled: boolean;
  /** Paint the highlights on the page: Signal Mode itself. Defaults to enabled. */
  highlight?: boolean;
  href: string;
  profileKey: string | null;
  profile: LinkedInProfile | null;
  ready: boolean;
  /** The active goal as text; ranking leans on it a little, and works without one. */
  goalText?: string | null;
}

export function isMainProfilePage(href: string): boolean {
  return /linkedin\.com\/in\/[^/?#]+\/?(?:[?#]|$)/.test(href);
}

export function isProfileSessionPage(href: string): boolean {
  return isMainProfilePage(href) || /linkedin\.com\/in\/[^/?#]+\/details\/[^/?#]+\/?(?:[?#]|$)/.test(href);
}

// Panel data can still describe the previous profile for a tick after SPA navigation.
export function signalTickInput(enabled: boolean, href: string, data: PanelProfileData, highlight = enabled, goalText: string | null = null): SignalTickInput {
  const profileKey = profileIdentityKey(href);
  const current = profileKey !== null && data.profileKey === profileKey;
  return {
    enabled,
    highlight,
    href,
    profileKey,
    profile: current ? data.profile : null,
    ready: current && data.collection?.status === "settled" && data.autoScanProgress?.status !== "scanning",
    goalText,
  };
}

// The style plan: the SignalPlan's chosen claims, drawn by kind. It never decides what matters.
// - Every chosen claim shows while Signal Mode is on. Its kind only picks its color: a claim of no
//   settings kind, or of a kind switched off, is drawn in the general Signal style, so switching
//   every category off still leaves Signal Mode's highlights. Nothing here ever needs a request.
// - Numbers and skills mark words inside a claim, only while their category is on; at most three
//   colors share one sentence.
export function signalTargets(highlights: InlineHighlightDTO[], prefs: HighlightPreferences = DEFAULT_HIGHLIGHT_PREFERENCES, skills: string[] = [], coverage?: SkillCoverage): SignalTarget[] {
  const { categories } = prefs;
  const terms = categories.skills.enabled ? skillTerms(skills) : [];
  const layerOf = (category: PhraseCategory): PhraseCategory => (category === "general" || categories[category].enabled ? category : "general");
  const visible = highlights.filter((s) => s.importance >= INLINE_MIN_IMPORTANCE);
  const targets: SignalTarget[] = [];
  visible.forEach((s, i) => {
    const category = layerOf(s.category ?? "general");
    const key = `${s.evidenceId}#${i}`;
    const metrics = categories.numbers.enabled ? s.metrics.filter((m) => isMeaningfulMetric(s.quote, m)) : [];
    const marked = skillsIn(s.quote, terms).filter((skill) => !metrics.some((m) => m.includes(skill) || skill.includes(m)));
    targets.push({ key, section: s.section, quote: s.quote, metrics, skills: marked, layer: category, sentence: s.sentence, counted: s.claim !== "support" });
  });
  const limited = limitColors(targets);
  return categories.skills.enabled && coverage ? withSkillCoverage(limited, visible, coverage) : limited;
}

// The skill lists of a profile, found in its own text (see skillLists). Category coverage: a list
// of skills shows all of them while Skills & Tools is on, whatever Smart highlighting chose.
export interface SkillCoverage {
  groups: SkillGroup[];
  itemTexts: ReadonlyMap<string, string>;
}

const GROUP_EDGE = /^[\s,/&]+|[\s,/&]+$/g;
const trimEdges = (text: string) => text.replace(GROUP_EDGE, "").replace(/^(?:and|or)\s+/i, "").replace(/\s+(?:and|or)$/i, "");

// A group inside a chosen claim becomes skill marks in it, so nothing is ever drawn twice or nested;
// what lies outside every chosen claim is drawn on its own in the Skills style. Coverage comes after
// the color limit, so an announced list is never cut, and it does not count as a signal of its own.
function withSkillCoverage(targets: SignalTarget[], visible: InlineHighlightDTO[], coverage: SkillCoverage): SignalTarget[] {
  // Targets line up with visible: one per chosen claim, in the same order.
  const result: SignalTarget[] = targets.map((t) => ({ ...t, skills: [...(t.skills ?? [])] }));
  for (const group of coverage.groups) {
    const text = coverage.itemTexts.get(group.evidenceId);
    if (!text) continue;
    const start = group.start;
    const end = start + group.text.length;
    const inside: [number, number][] = [];
    visible.forEach((h, i) => {
      if (h.evidenceId !== group.evidenceId) return;
      const at = text.indexOf(h.quote);
      if (at === -1 || at >= end || at + h.quote.length <= start) return;
      const from = Math.max(start, at);
      const to = Math.min(end, at + h.quote.length);
      const mark = trimEdges(text.slice(from, to));
      const target = result[i];
      if (!mark || !target) return;
      target.skills = [...(target.skills ?? []).filter((s) => !mark.includes(s)), mark];
      target.metrics = target.metrics.filter((m) => !mark.includes(m));
      inside.push([from, to]);
    });
    // The parts no chosen claim covers.
    let cursor = start;
    for (const [from, to] of [...inside].sort((a, b) => a[0] - b[0])) {
      if (from > cursor) result.push(standalone(group, text, cursor, from));
      cursor = Math.max(cursor, to);
    }
    if (cursor < end) result.push(standalone(group, text, cursor, end));
  }
  return result.filter((t) => t.quote.length > 0);
}

function standalone(group: SkillGroup, text: string, from: number, to: number): SignalTarget {
  const raw = text.slice(from, to);
  const quote = trimEdges(raw);
  return { key: `skills:${group.evidenceId}:${from}`, section: group.section, quote, metrics: [], layer: "skills", sentence: `${group.evidenceId}:${sentenceIndex(text, from)}`, counted: false };
}

// Skill lists come from the profile's own text, plus the skills the semantic analysis classified.
export function skillCoverage(profile: LinkedInProfile | null, ranking?: Pick<RankingResult, "debug">): SkillCoverage | undefined {
  if (!profile) return undefined;
  const items = buildEvidencePayload(profile).filter((item) => !["headline", "location", "skills", "languages"].includes(item.section));
  const classified = (ranking?.debug ?? []).filter((r) => r.type === "skill").flatMap((r) => r.quote.split(/\s*,\s*(?:and\s+)?|\s+and\s+/));
  return { groups: skillGroups(items, [...profile.skills, ...classified]), itemTexts: new Map(items.map((item) => [item.id, item.text])) };
}

const MAX_COLORS_PER_SENTENCE = 3;

// Restraint over completeness: when a sentence would carry more than three colors, its skill
// marks go first, then its number marks. The claims themselves always stay.
function limitColors(targets: SignalTarget[]): SignalTarget[] {
  const bySentence = new Map<string, SignalTarget[]>();
  for (const t of targets) if (t.sentence) bySentence.set(t.sentence, [...(bySentence.get(t.sentence) ?? []), t]);
  const colors = (group: SignalTarget[]) =>
    new Set(group.flatMap((t) => [t.layer, t.metrics.length > 0 ? "numbers" : null, (t.skills?.length ?? 0) > 0 ? "skills" : null]).filter(Boolean)).size;
  for (const group of bySentence.values()) {
    if (colors(group) > MAX_COLORS_PER_SENTENCE) for (const t of group) t.skills = [];
    if (colors(group) > MAX_COLORS_PER_SENTENCE) for (const t of group) t.metrics = [];
  }
  return targets;
}

// Roles, project names, and languages are read from the profile's own structure: the title of
// each position, each project's name, each language and its level. No AI is involved.
export function structuralTargets(profile: LinkedInProfile | null, prefs: HighlightPreferences = DEFAULT_HIGHLIGHT_PREFERENCES): SignalTarget[] {
  if (!profile) return [];
  const { categories } = prefs;
  const targets: SignalTarget[] = [];
  const add = (layer: HighlightCategory, section: string, quote: string | undefined, titles: SignalTarget["titles"], i: number) => {
    const text = quote?.trim();
    if (text && text.length <= 120) targets.push({ key: `${layer}:${section}:${i}:${text}`, section, quote: text, metrics: [], layer, titles });
  };
  if (categories.roles.enabled) {
    profile.experience.forEach((e, i) => add("roles", "experience", e.title, "only", i));
    profile.volunteering.forEach((e, i) => add("roles", "volunteering", e.name, "only", i));
  }
  if (categories.projects.enabled) profile.projects.forEach((e, i) => add("projects", "projects", e.name, "only", i));
  if (categories.languages.enabled) {
    profile.languages.forEach((e, i) => {
      add("languages", "languages", e.name, "any", i);
      add("languages", "languages", e.description, "any", i);
    });
  }
  return targets;
}

export interface SignalRuntimeOptions {
  highlighter: Pick<SignalHighlighter, "render" | "clear">;
  publish: (state: SignalAnalysisState, highlighted: number) => void;
  createController?: (onChange: () => void) => Pick<SignalAnalysisController, "update" | "reset" | "getState">;
  /** How each kind of evidence is drawn; read at every paint, never sent anywhere. */
  getPreferences?: () => HighlightPreferences;
}

export function createSignalRuntime(options: SignalRuntimeOptions) {
  const { highlighter, publish } = options;
  const controller = options.createController?.(() => paint()) ?? new SignalAnalysisController({ onChange: () => paint() });
  const preferences = options.getPreferences ?? (() => DEFAULT_HIGHLIGHT_PREFERENCES);
  let activeProfileKey: string | null = null;
  let activeProfile: LinkedInProfile | null = null;
  let highlightOn = false;

  function paint(): void {
    const state = controller.getState();
    const prefs = preferences();
    const ready = state.status === "ready" && state.profileKey === activeProfileKey;
    const coverage = ready && prefs.categories.skills.enabled ? skillCoverage(activeProfile, state.ranking) : undefined;
    const targets = highlightOn && activeProfileKey ? [...structuralTargets(activeProfile, prefs), ...(ready ? signalTargets(state.highlights, prefs, activeProfile?.skills, coverage) : [])] : [];
    const count = targets.length > 0 ? highlighter.render(targets) : 0;
    if (targets.length === 0) highlighter.clear();
    publish(activeProfileKey ? state : { status: "idle" }, count);
  }

  function tick(input: SignalTickInput): void {
    highlightOn = input.highlight ?? input.enabled;
    if (!input.enabled || !input.profileKey || !isProfileSessionPage(input.href)) {
      activeProfileKey = null;
      activeProfile = null;
      controller.reset();
      paint();
      return;
    }
    if (input.profileKey !== activeProfileKey) {
      activeProfileKey = input.profileKey;
      activeProfile = null;
      controller.reset();
    }
    if (input.profile) activeProfile = input.profile;
    if (input.ready && input.profile) controller.update({ profileKey: input.profileKey, profile: input.profile, goalText: input.goalText ?? null });
    paint();
  }

  function dispose(): void {
    activeProfileKey = null;
    activeProfile = null;
    controller.reset();
    highlighter.clear();
  }

  // A style or category change: the same evidence, drawn again. Nothing is requested.
  return { tick, dispose, repaint: paint };
}
