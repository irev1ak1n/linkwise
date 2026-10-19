// The kinds of profile evidence Signal Mode can color separately. Ranking decides WHAT is
// highlighted; a category only decides HOW a chosen claim looks. Roles and Languages come from
// the profile's own structure, Numbers and Skills are marks inside chosen claims, and the rest
// are the primary kind of a chosen claim. A chosen claim that fits none of them is "general" and
// keeps the Signal color: the settings categories style evidence, they never limit what counts.
import type { Grades, SemanticLabel, SignalFactType } from "../ai/signalTypes";
import {
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_HIGHLIGHT_LOOK,
  DEFAULT_KEYWORD_HIGHLIGHT_COLOR,
  toHighlightColor,
  toHighlightLook,
  type CustomHighlightColor,
  type HighlightColor,
  type HighlightLook,
} from "../linkedin/highlightPalette";
import { normalizeHex } from "../linkedin/highlightColor";

export const HIGHLIGHT_CATEGORIES = ["roles", "numbers", "impact", "leadership", "skills", "achievements", "projects", "languages"] as const;
export type HighlightCategory = (typeof HIGHLIGHT_CATEGORIES)[number];
/** The style layer of a whole chosen claim; numbers and skills only mark words inside one. */
export type PhraseCategory = "impact" | "leadership" | "achievements" | "projects" | "general";
/** Every style layer the highlighter draws: the settings categories plus general Signal. */
export type StyleLayer = HighlightCategory | "general";
export const STYLE_LAYERS: readonly StyleLayer[] = [...HIGHLIGHT_CATEGORIES, "general"];

/** Important claims of no particular kind: always shown while Signal Mode is on, in the Signal color. */
export const GENERAL_STYLE = { enabled: true, color: DEFAULT_HIGHLIGHT_COLOR, look: DEFAULT_HIGHLIGHT_LOOK } as const;

export interface CategoryInfo {
  label: string;
  description: string;
  preview: string;
}

export const CATEGORY_INFO: Record<HighlightCategory, CategoryInfo> = {
  roles: { label: "Roles", description: "Job titles and positions the person holds or held.", preview: "Founder & CEO" },
  numbers: { label: "Meaningful Numbers", description: "Numbers that measure something: reach, rank, hours, team size. Never dates.", preview: "500+ users" },
  impact: { label: "Impact", description: "Outcomes and results of the person's work.", preview: "Reached 500+ people" },
  leadership: { label: "Leadership", description: "Leading, mentoring, teaching, or organizing others.", preview: "Led a five-person team" },
  skills: { label: "Skills & Tools", description: "The person's listed skills and tools, inside highlighted evidence.", preview: "React" },
  achievements: { label: "Achievements", description: "Awards, placements, selective admissions, and credentials.", preview: "2nd place" },
  projects: { label: "Projects", description: "Things the person built, shipped, or owned.", preview: "Built a staff dashboard" },
  languages: { label: "Languages", description: "Spoken languages and proficiency.", preview: "Russian — Native" },
};

export const KEYWORDS_INFO: CategoryInfo = { label: "Keywords", description: "Your own words and phrases, highlighted wherever they appear.", preview: "Python" };

export interface HighlightStyle {
  enabled: boolean;
  /** The preset shade, used until the user picks a color of their own. */
  color: HighlightColor;
  /** How the phrase is drawn: Solid, Soft, Underline, Text Color, Dashed, or Left Border. */
  look: HighlightLook;
  /** A color from the color editor; when present it replaces the preset. */
  custom?: CustomHighlightColor;
}

export interface HighlightPreferences {
  categories: Record<HighlightCategory, HighlightStyle>;
  keywords: HighlightStyle;
}

const style = (color: HighlightColor): HighlightStyle => ({ enabled: true, color, look: DEFAULT_HIGHLIGHT_LOOK });

export const DEFAULT_HIGHLIGHT_PREFERENCES: HighlightPreferences = {
  categories: {
    roles: style("blue"),
    numbers: style("mint"),
    impact: style("green"),
    leadership: style("purple"),
    skills: style("sky"),
    achievements: style("yellow"),
    projects: style("violet"),
    languages: style("coral"),
  },
  keywords: style(DEFAULT_KEYWORD_HIGHLIGHT_COLOR),
};

// The kind of evidence a chosen phrase is. Rules on grades first catch what the type alone
// misses ("Led the website's full-stack development" is leadership as much as technical work).
const TYPE_CATEGORY: Partial<Record<SignalFactType, PhraseCategory>> = {
  competition_result: "achievements",
  award: "achievements",
  selective_admission: "achievements",
  credential: "achievements",
  measurable_impact: "impact",
  volunteering_impact: "impact",
  leadership_scope: "leadership",
  teaching_scope: "leadership",
  project_ownership: "projects",
  technical_execution: "projects",
};

const LABEL_CATEGORY: [SemanticLabel[], PhraseCategory][] = [
  [["achievement", "selectivity", "credential"], "achievements"],
  [["leadership", "teaching"], "leadership"],
  [["impact"], "impact"],
  [["project", "technical_execution"], "projects"],
];

// Decided only after a claim was chosen, and never the reason it was chosen. Milestones, long
// training, distinctions, and other important claims of no settings kind stay "general".
export function phraseCategory(candidate: { type: SignalFactType; grades: Grades; labels?: SemanticLabel[] }): PhraseCategory {
  const g = candidate.grades;
  const byType = TYPE_CATEGORY[candidate.type];
  if (byType === "achievements" || g.selectivity >= 3) return "achievements";
  if (byType) return byType;
  if (candidate.labels && candidate.labels.length > 0) {
    // Labels come most relevant first: the claim's main kind decides, and a claim whose main kind
    // has no settings category (a milestone, long training) stays general.
    return LABEL_CATEGORY.find(([labels]) => labels.includes(candidate.labels![0]!))?.[1] ?? "general";
  }
  if (g.leadership >= 2) return "leadership";
  if (g.result >= 2 || g.impact >= 2) return "impact";
  if (g.ownership >= 2 && g.technicalDepth >= 1) return "projects";
  return "general";
}

function parseCustom(value: unknown): CustomHighlightColor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as { hex?: unknown; opacity?: unknown };
  const hex = typeof v.hex === "string" ? normalizeHex(v.hex) : null;
  if (!hex || typeof v.opacity !== "number" || !Number.isFinite(v.opacity)) return undefined;
  return { hex, opacity: Math.min(1, Math.max(0, v.opacity)) };
}

function parseStyle(value: unknown, fallback: HighlightStyle): HighlightStyle {
  if (!value || typeof value !== "object") return fallback;
  const v = value as Partial<Record<keyof HighlightStyle, unknown>>;
  const custom = parseCustom(v.custom);
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : fallback.enabled,
    color: toHighlightColor(v.color) ?? fallback.color,
    // Before looks, Numbers and Keywords carried an underline flag; they open as Solid now.
    look: toHighlightLook(v.look) ?? fallback.look,
    ...(custom ? { custom } : {}),
  };
}

export function parseHighlightPreferences(value: unknown, defaults: HighlightPreferences = DEFAULT_HIGHLIGHT_PREFERENCES): HighlightPreferences {
  const v = value && typeof value === "object" ? (value as { categories?: Record<string, unknown>; keywords?: unknown }) : {};
  const categories = Object.fromEntries(HIGHLIGHT_CATEGORIES.map((c) => [c, parseStyle(v.categories?.[c], defaults.categories[c])])) as HighlightPreferences["categories"];
  return { categories, keywords: parseStyle(v.keywords, defaults.keywords) };
}

// Before categories there was one Signal color and one keyword color. A custom Signal color
// becomes Impact's (the most common kind of chosen evidence), and whichever category had that
// color by default takes Impact's, so two categories never start out alike.
export function migrateLegacyColors(signalColor: unknown, keywordColor: unknown): HighlightPreferences {
  const prefs = parseHighlightPreferences(undefined);
  const legacy = toHighlightColor(signalColor);
  if (legacy && legacy !== DEFAULT_HIGHLIGHT_COLOR && legacy !== prefs.categories.impact.color) {
    const owner = HIGHLIGHT_CATEGORIES.find((c) => prefs.categories[c].color === legacy);
    if (owner) prefs.categories[owner] = { ...prefs.categories[owner], color: prefs.categories.impact.color };
    prefs.categories.impact = { ...prefs.categories.impact, color: legacy };
  }
  const keyword = toHighlightColor(keywordColor);
  if (keyword) prefs.keywords = { ...prefs.keywords, color: keyword };
  return prefs;
}

/** Reset restores every style, never the user's keyword text (which lives in its own setting). */
export function resetHighlightStyles(): HighlightPreferences {
  return parseHighlightPreferences(undefined);
}

// Grades cached before a metric rule changed still carry their old metrics, so the same check
// runs here: "'26" is a year and "11th grade" a grade level, never a meaningful number.
export function isMeaningfulMetric(quote: string, metric: string): boolean {
  const at = quote.indexOf(metric);
  if (at === -1) return false;
  if (/['‘’]$/.test(quote.slice(0, at))) return false;
  if (/^\d+(?:st|nd|rd|th)$/i.test(metric) && /^\s*(?:grade|grader|year|semester)\b/i.test(quote.slice(at + metric.length))) return false;
  return !/^(?:19|20)\d{2}$/.test(metric);
}
