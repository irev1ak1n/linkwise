// The kinds of profile evidence Signal Mode can color separately. Ranking decides WHAT is
// highlighted; a category only decides HOW a chosen phrase looks. Roles and Languages come from
// the profile's own structure, Numbers and Skills are marks inside chosen phrases, and the rest
// are the primary kind of a chosen phrase.
import type { Grades, SignalFactType } from "../ai/signalTypes";
import { DEFAULT_HIGHLIGHT_COLOR, DEFAULT_KEYWORD_HIGHLIGHT_COLOR, toHighlightColor, type HighlightColor } from "../linkedin/highlightPalette";

export const HIGHLIGHT_CATEGORIES = ["roles", "numbers", "impact", "leadership", "skills", "achievements", "projects", "languages"] as const;
export type HighlightCategory = (typeof HIGHLIGHT_CATEGORIES)[number];
/** Categories a whole chosen phrase can take; numbers and skills only mark words inside one. */
export type PhraseCategory = "impact" | "leadership" | "achievements" | "projects";

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
  color: HighlightColor;
  underline: boolean;
}

export interface HighlightPreferences {
  categories: Record<HighlightCategory, HighlightStyle>;
  keywords: HighlightStyle;
}

const style = (color: HighlightColor, underline = false): HighlightStyle => ({ enabled: true, color, underline });

// Numbers and keywords were always underlined, so they keep it by default.
export const DEFAULT_HIGHLIGHT_PREFERENCES: HighlightPreferences = {
  categories: {
    roles: style("blue"),
    numbers: style("mint", true),
    impact: style("green"),
    leadership: style("purple"),
    skills: style("sky"),
    achievements: style("yellow"),
    projects: style("violet"),
    languages: style("coral"),
  },
  keywords: style(DEFAULT_KEYWORD_HIGHLIGHT_COLOR, true),
};

// The kind of evidence a chosen phrase is. Rules on grades first catch what the type alone
// misses ("Led the website's full-stack development" is leadership as much as technical work).
const TYPE_CATEGORY: Partial<Record<SignalFactType, PhraseCategory>> = {
  competition_result: "achievements",
  award: "achievements",
  selective_admission: "achievements",
  credential: "achievements",
  sustained_training: "achievements",
  measurable_impact: "impact",
  volunteering_impact: "impact",
  leadership_scope: "leadership",
  teaching_scope: "leadership",
  project_ownership: "projects",
  technical_execution: "projects",
};

export function phraseCategory(candidate: { type: SignalFactType; grades: Grades }): PhraseCategory {
  const g = candidate.grades;
  const byType = TYPE_CATEGORY[candidate.type];
  if (byType === "achievements" || g.selectivity >= 3) return "achievements";
  if (byType) return byType;
  if (g.leadership >= 2) return "leadership";
  if (g.result >= 2 || g.impact >= 2) return "impact";
  if (g.ownership >= 2 && g.technicalDepth >= 1) return "projects";
  return "impact";
}

function parseStyle(value: unknown, fallback: HighlightStyle): HighlightStyle {
  if (!value || typeof value !== "object") return fallback;
  const v = value as Partial<Record<keyof HighlightStyle, unknown>>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : fallback.enabled,
    color: toHighlightColor(v.color) ?? fallback.color,
    underline: typeof v.underline === "boolean" ? v.underline : fallback.underline,
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
