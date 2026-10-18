import { panelToolPreference, type PanelTool } from "../../optimizer/optimizerPreferences";

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
