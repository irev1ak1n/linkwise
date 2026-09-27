import { createStoredPreference } from "./storedPreference";

export const AUTO_SCROLL_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type AutoScrollSpeed = (typeof AUTO_SCROLL_SPEEDS)[number];
export const DEFAULT_AUTO_SCROLL_SPEED: AutoScrollSpeed = 1;
export const AUTO_SCROLL_SPEED_STORAGE_KEY = "finder.autoScrollSpeed.v1";

export function toAutoScrollSpeed(value: unknown): AutoScrollSpeed | undefined {
  return AUTO_SCROLL_SPEEDS.find((speed) => speed === value);
}

export const autoScrollSpeedPreference = createStoredPreference<AutoScrollSpeed>(AUTO_SCROLL_SPEED_STORAGE_KEY, DEFAULT_AUTO_SCROLL_SPEED, toAutoScrollSpeed);
