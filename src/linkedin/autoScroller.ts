import { createAutoScrollController } from "./autoScrollController";
import { autoScrollSpeedPreference } from "./panel/autoScrollSpeedPreference";

const frames = typeof requestAnimationFrame === "function";

// The one scroller shared by the main profile, opened sections, and the panel's controls.
export const autoScroller = createAutoScrollController({
  now: () => Date.now(),
  requestFrame: (callback) => (frames ? requestAnimationFrame(callback) : setTimeout(callback, 16)),
  cancelFrame: (handle) => (frames ? cancelAnimationFrame(handle as number) : clearTimeout(handle as ReturnType<typeof setTimeout>)),
  getSpeed: () => autoScrollSpeedPreference.getState().value,
});
