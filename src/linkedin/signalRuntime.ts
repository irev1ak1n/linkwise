import { SignalAnalysisController, type SignalAnalysisState } from "../ai/signalAnalysisController";
import type { InlineHighlightDTO } from "../ai/signalTypes";
import type { LinkedInProfile } from "../models/profile";
import { SignalHighlighter } from "./signalHighlighter";
import type { SignalTarget } from "./signalRanges";
import { profileIdentityKey } from "./profileAdapter";
import type { PanelProfileData } from "./panel/panelStore";
import { DEFAULT_HIGHLIGHT_PREFERENCES, isMeaningfulMetric, type HighlightCategory, type HighlightPreferences } from "../signals/highlightCategories";
import { skillTerms, skillsIn } from "../signals/skillTerms";

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

// Chosen evidence, styled by its kind. A disabled kind is simply not drawn; its evidence and
// grades stay, so turning it back on needs no new request.
export function signalTargets(highlights: InlineHighlightDTO[], prefs: HighlightPreferences = DEFAULT_HIGHLIGHT_PREFERENCES, skills: string[] = []): SignalTarget[] {
  const { categories } = prefs;
  const terms = categories.skills.enabled ? skillTerms(skills) : [];
  return highlights
    .filter((s) => s.importance >= INLINE_MIN_IMPORTANCE && categories[s.category ?? "impact"].enabled)
    .map((s, i) => {
      const metrics = categories.numbers.enabled ? s.metrics.filter((m) => isMeaningfulMetric(s.quote, m)) : [];
      const marked = skillsIn(s.quote, terms).filter((skill) => !metrics.some((m) => m.includes(skill) || skill.includes(m)));
      return { key: `${s.evidenceId}#${i}`, section: s.section, quote: s.quote, metrics, skills: marked, layer: s.category ?? "impact" };
    });
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
    const targets = highlightOn && activeProfileKey ? [...structuralTargets(activeProfile, prefs), ...(ready ? signalTargets(state.highlights, prefs, activeProfile?.skills) : [])] : [];
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
