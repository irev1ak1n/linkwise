import { panelToolPreference, type PanelTool } from "../../optimizer/optimizerPreferences";
import type { HighlightCategory } from "../../signals/highlightCategories";

// Settings is global: it remembers which tool opened it so its back button returns there. Only the
// tool is recorded, since each tool's own page (an Optimizer section, a saved profile, an Analyzer
// subpage) already lives in module state that survives switching tools. Module state on purpose:
// after a reload there is no origin, and back falls through to the menu.
export type SettingsOrigin = Exclude<PanelTool, "settings">;

let origin: SettingsOrigin | null = null;

export function openSettings(): void {
  const current = panelToolPreference.getState().value;
  if (current !== "settings") origin = current;
  panelToolPreference.set("settings");
}

export function leaveSettings(): void {
  panelToolPreference.set(origin ?? "menu");
}

export function getSettingsOrigin(): SettingsOrigin | null {
  return origin;
}

export function resetSettingsOriginForTests(): void {
  origin = null;
}

// Settings → Highlighting → a category's page. Module state like the other tools' pages, so the
// open page survives switching tools; the list's scroll position is kept for the way back.
export type HighlightRuleId = HighlightCategory | "keywords";

let highlightRule: HighlightRuleId | null = null;
let listScrollTop = 0;
const ruleListeners = new Set<() => void>();

export function getHighlightRule(): HighlightRuleId | null {
  return highlightRule;
}

export function subscribeHighlightRule(listener: () => void): () => void {
  ruleListeners.add(listener);
  return () => ruleListeners.delete(listener);
}

export function openHighlightRule(rule: HighlightRuleId, scrollTop = 0): void {
  if (highlightRule === null) listScrollTop = scrollTop;
  highlightRule = rule;
  ruleListeners.forEach((l) => l());
}

let restoreScroll: number | null = null;

/** Back to the highlight list, which then scrolls to where it was left. */
export function closeHighlightRule(): void {
  highlightRule = null;
  restoreScroll = listScrollTop;
  ruleListeners.forEach((l) => l());
}

/** Where the list should scroll to now that it is shown again, once. */
export function takeListScroll(): number | null {
  const top = restoreScroll;
  restoreScroll = null;
  return top;
}

export function resetHighlightRuleForTests(): void {
  highlightRule = null;
  listScrollTop = 0;
  restoreScroll = null;
}
