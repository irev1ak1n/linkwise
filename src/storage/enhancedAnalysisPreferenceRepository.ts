// Local-only persistence for the "Enhanced analysis" checkbox, same pattern as
// expandDetailsPreferenceRepository.ts. Only meaningful in Auto scan mode.
export const ENHANCED_ANALYSIS_STORAGE_KEY = "finder.enhancedAnalysis.v1";
export const DEFAULT_ENHANCED_ANALYSIS_PREFERENCE = false;

export async function loadEnhancedAnalysisPreference(): Promise<boolean> {
  const stored = await chrome.storage.local.get(ENHANCED_ANALYSIS_STORAGE_KEY);
  const value = stored[ENHANCED_ANALYSIS_STORAGE_KEY];
  return typeof value === "boolean" ? value : DEFAULT_ENHANCED_ANALYSIS_PREFERENCE;
}

export async function saveEnhancedAnalysisPreference(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [ENHANCED_ANALYSIS_STORAGE_KEY]: value });
}
