import { createStoredPreference } from "../linkedin/panel/storedPreference";

export const OPTIMIZER_CONTEXT_STORAGE_KEY = "finder.optimizerContext.v1";
export const PANEL_TOOL_STORAGE_KEY = "finder.panelTool.v1";

export type PanelTool = "analyzer" | "optimizer" | "highlights" | "jobs" | "saved";

export const optimizerContextPreference = createStoredPreference<string>(OPTIMIZER_CONTEXT_STORAGE_KEY, "", (stored) =>
  typeof stored === "string" ? stored : undefined,
);

export const panelToolPreference = createStoredPreference<PanelTool>(PANEL_TOOL_STORAGE_KEY, "analyzer", (stored) =>
  stored === "analyzer" || stored === "optimizer" || stored === "highlights" || stored === "jobs" || stored === "saved" ? stored : undefined,
);
