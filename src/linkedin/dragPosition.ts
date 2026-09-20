// Pure math for the opener tab's vertical drag, kept free of the DOM so it's unit-testable.

// Movement under this counts as a click, not a drag, so a slightly unsteady hand can still
// click normally.
export const DRAG_THRESHOLD_PX = 5;

export function isDrag(peakDeltaPx: number): boolean {
  return peakDeltaPx > DRAG_THRESHOLD_PX;
}

// Keeps the whole element inside the viewport, top edge and bottom edge both on screen.
export function clampTopPx(topPx: number, viewportHeight: number, elementHeight: number): number {
  const maxTop = Math.max(0, viewportHeight - elementHeight);
  return Math.min(Math.max(topPx, 0), maxTop);
}
