import { createAutoScrollController } from "./autoScrollController";

const frames = typeof requestAnimationFrame === "function";

// The one scroller shared by the main profile and opened sections.
export const autoScroller = createAutoScrollController({
  now: () => Date.now(),
  requestFrame: (callback) => (frames ? requestAnimationFrame(callback) : setTimeout(callback, 16)),
  cancelFrame: (handle) => (frames ? cancelAnimationFrame(handle as number) : clearTimeout(handle as ReturnType<typeof setTimeout>)),
});
