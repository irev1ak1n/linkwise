import { createStoredPreference } from "../linkedin/panel/storedPreference";

export const OPTIMIZER_CONTEXT_STORAGE_KEY = "finder.optimizerContext.v1";
export const PANEL_TOOL_STORAGE_KEY = "finder.panelTool.v1";

export type PanelTool = "menu" | "analyzer" | "optimizer" | "jobs" | "saved";

export const optimizerContextPreference = createStoredPreference<string>(OPTIMIZER_CONTEXT_STORAGE_KEY, "", (stored) =>
  typeof stored === "string" ? stored : undefined,
);

// Smart Highlights now lives inside Profile Analyzer, so an old saved choice opens it there.
export function decodePanelTool(stored: unknown): PanelTool | undefined {
  if (stored === "highlights") return "analyzer";
  return stored === "menu" || stored === "analyzer" || stored === "optimizer" || stored === "jobs" || stored === "saved" ? stored : undefined;
}

export const panelToolPreference = createStoredPreference<PanelTool>(PANEL_TOOL_STORAGE_KEY, "menu", decodePanelTool);
