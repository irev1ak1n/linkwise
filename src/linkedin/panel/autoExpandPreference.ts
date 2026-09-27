import { createBooleanPreference } from "./storedPreference";

export const AUTO_EXPAND_STORAGE_KEY = "finder.autoScanExpandDetails.v1";
export const autoExpandPreference = createBooleanPreference(AUTO_EXPAND_STORAGE_KEY, true);
