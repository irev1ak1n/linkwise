// Injects the fixed "LinkWise" tab on the page edge, the only UI this extension adds besides
// the panel itself. Styled with inline styles so LinkedIn's CSS can never touch it.
//
// The tab is draggable vertically only, it always stays pinned to the right edge. Dragging is
// built on Pointer Events (not separate mouse/touch handlers) so a mouse, touch, or stylus all
// work the same way, and setPointerCapture keeps receiving moves even if the pointer leaves
// the button mid-drag.
import { clampTopPx, isDrag } from "./dragPosition";
import { loadOpenerTopPx, saveOpenerTopPx } from "../storage/openerPositionRepository";

const OPENER_ID = "finder-linkwise-opener";

function applyOpenerStyles(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    position: "fixed",
    top: "50%",
    right: "0",
    transform: "translateY(-50%)",
    zIndex: "2147483647",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    padding: "12px 7px",
    margin: "0",
    border: "none",
    borderRadius: "8px 0 0 8px",
    background: "#0a66c2",
    color: "#ffffff",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontSize: "13px",
    fontWeight: "600",
    letterSpacing: "0.03em",
    lineHeight: "1",
    cursor: "grab",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.25)",
    transition: "right 0.15s ease",
    touchAction: "none", // otherwise touch scrolling can steal the gesture mid-drag
    userSelect: "none",
  });
}

// Reads the button's actual rendered top, whether it got there via the default
// transform-centered style or a previously-applied explicit top px.
function currentTopPx(button: HTMLButtonElement): number {
  return button.getBoundingClientRect().top;
}

function applyTopPx(button: HTMLButtonElement, topPx: number): void {
  button.style.top = `${topPx}px`;
  button.style.transform = "none";
}

async function applyStoredPosition(button: HTMLButtonElement): Promise<void> {
  const savedTopPx = await loadOpenerTopPx();
  if (savedTopPx === null) return; // keep the default centered position
  applyTopPx(button, clampTopPx(savedTopPx, window.innerHeight, button.offsetHeight));
}

// Re-clamps whenever the window is resized, so the tab can never end up partly or fully
// off-screen after a viewport change. Tracked at module scope so removeLinkWiseOpener can
// clean it up, since it's a window listener rather than one scoped to the button itself.
let resizeHandler: (() => void) | null = null;

function attachResizeHandler(button: HTMLButtonElement): void {
  if (resizeHandler) return;
  resizeHandler = () => {
    const clamped = clampTopPx(currentTopPx(button), window.innerHeight, button.offsetHeight);
    applyTopPx(button, clamped);
    void saveOpenerTopPx(clamped);
  };
  window.addEventListener("resize", resizeHandler);
}

// Wires up vertical-only dragging plus click detection, called once per button. A later
// ensureLinkWiseOpener call just updates which onToggle the click invokes (see getOnToggle).
function setupDragging(button: HTMLButtonElement, getOnToggle: () => (() => void) | null): void {
  let dragging = false;
  let pointerId: number | null = null;
  let startClientY = 0;
  let startTopPx = 0;
  let peakDelta = 0;
  let suppressNextClick = false;

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return; // primary button/touch contact only
    dragging = true;
    pointerId = event.pointerId;
    startClientY = event.clientY;
    startTopPx = currentTopPx(button);
    peakDelta = 0;
    button.setPointerCapture?.(pointerId);
    button.style.cursor = "grabbing";
    document.body.style.userSelect = "none"; // a fast drag can otherwise select page text
  });

  button.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const deltaY = event.clientY - startClientY;
    peakDelta = Math.max(peakDelta, Math.abs(deltaY));
    if (!isDrag(peakDelta)) return; // still within the click threshold, don't move yet
    applyTopPx(button, clampTopPx(startTopPx + deltaY, window.innerHeight, button.offsetHeight));
  });

  function endDrag(event: PointerEvent): void {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    button.style.cursor = "grab";
    document.body.style.userSelect = "";
    if (pointerId !== null) button.releasePointerCapture?.(pointerId);
    pointerId = null;
    if (isDrag(peakDelta)) {
      suppressNextClick = true; // the browser still fires a click after pointerup, swallow it
      void saveOpenerTopPx(currentTopPx(button));
    }
  }

  button.addEventListener("pointerup", endDrag);
  button.addEventListener("pointercancel", endDrag);

  button.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    getOnToggle()?.();
  });
}

let onToggleRef: (() => void) | null = null;

// Idempotent, safe to call repeatedly. Creates the button once and updates which callback a
// click invokes on every call.
export function ensureLinkWiseOpener(onToggle: () => void): void {
  onToggleRef = onToggle;

  const existing = document.getElementById(OPENER_ID) as HTMLButtonElement | null;
  if (existing) return;

  const button = document.createElement("button");
  button.id = OPENER_ID;
  button.type = "button";
  button.textContent = "LinkWise";
  button.setAttribute("aria-label", "Open or close the LinkWise panel");
  applyOpenerStyles(button);
  setupDragging(button, () => onToggleRef);

  document.body.appendChild(button);
  attachResizeHandler(button);
  void applyStoredPosition(button);
}

// Shifts the opener to the panel's edge while open, back to the page edge once closed. Only
// ever touches the horizontal offset, the vertical drag position is independent of this.
export function setOpenerOffset(offsetPx: number): void {
  const existing = document.getElementById(OPENER_ID) as HTMLButtonElement | null;
  if (existing) existing.style.right = `${offsetPx}px`;
}

// Used only during teardown, to avoid a duplicate once a fresh instance takes over.
export function removeLinkWiseOpener(): void {
  document.getElementById(OPENER_ID)?.remove();
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }
}
