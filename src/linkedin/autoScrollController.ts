// Hands-free scrolling for Auto scan: a gentle, speed-adjustable read-through of whichever page
// is open, main profile or a section. Only moves the page; extraction and analysis stay on their
// own debounced ticks.
export type AutoScrollStatus = "idle" | "running" | "paused" | "complete";

export interface AutoScrollState {
  status: AutoScrollStatus;
  target: string | null;
}

export interface ScrollContainer {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  style?: { overflowAnchor: string };
}

export interface AutoScrollDeps {
  now: () => number;
  requestFrame: (callback: () => void) => unknown;
  cancelFrame: (handle: unknown) => void;
  getSpeed: () => number;
}

export const BASE_SCROLL_PX_PER_SECOND = 80;
// LinkedIn keeps loading content near the bottom, so the end only counts once it stops growing.
export const END_WAIT_MS = 2000;
// Movement follows elapsed time, so throttled frames in a covered window keep the same speed.
const MAX_FRAME_GAP_MS = 500;

export function createAutoScrollController(deps: AutoScrollDeps) {
  let state: AutoScrollState = { status: "idle", target: null };
  const listeners = new Set<() => void>();
  let getContainer: () => ScrollContainer = () => ({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  let frame: unknown = null;
  let lastTime: number | null = null;
  let carry = 0;
  let atEndSince: number | null = null;
  let anchored: { el: ScrollContainer; previous: string } | null = null;

  // Scroll anchoring would jump the view past sections LinkedIn renders above its anchor.
  function holdAnchoring(): void {
    const el = getContainer();
    if (anchored || !el.style) return;
    anchored = { el, previous: el.style.overflowAnchor };
    el.style.overflowAnchor = "none";
  }

  function releaseAnchoring(): void {
    if (anchored?.el.style) anchored.el.style.overflowAnchor = anchored.previous;
    anchored = null;
  }

  function setState(next: AutoScrollState): void {
    if (next.status === state.status && next.target === state.target) return;
    state = next;
    listeners.forEach((listener) => listener());
  }

  function stopFrames(): void {
    releaseAnchoring();
    if (frame !== null) deps.cancelFrame(frame);
    frame = null;
    lastTime = null;
    atEndSince = null;
  }

  function schedule(): void {
    holdAnchoring();
    if (frame === null) frame = deps.requestFrame(step);
  }

  function step(): void {
    frame = null;
    if (state.status !== "running") return;
    const el = getContainer();
    const now = deps.now();
    const elapsed = lastTime === null ? 0 : Math.min(now - lastTime, MAX_FRAME_GAP_MS);
    lastTime = now;

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
      atEndSince ??= now;
      if (now - atEndSince >= END_WAIT_MS) {
        stopFrames();
        setState({ ...state, status: "complete" });
        return;
      }
    } else {
      atEndSince = null;
      carry += (BASE_SCROLL_PX_PER_SECOND * deps.getSpeed() * elapsed) / 1000;
      const px = Math.floor(carry);
      if (px > 0) {
        carry -= px;
        el.scrollTop += px;
      }
    }
    schedule();
  }

  return {
    getState: (): AutoScrollState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Starts reading through `target` once; later calls for the same target never restart it. */
    start(target: string, container: () => ScrollContainer): void {
      if (state.target === target && state.status !== "idle") return;
      stopFrames();
      getContainer = container;
      carry = 0;
      setState({ status: "running", target });
      schedule();
    },
    pause(): void {
      if (state.status !== "running") return;
      stopFrames();
      setState({ ...state, status: "paused" });
    },
    resume(): void {
      if (state.status !== "paused") return;
      setState({ ...state, status: "running" });
      schedule();
    },
    reset(): void {
      stopFrames();
      setState({ status: "idle", target: null });
    },
  };
}

export type AutoScrollController = ReturnType<typeof createAutoScrollController>;

const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "]);

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

// Programmatic scrolling only ever fires "scroll" events, never these input events, so the
// controller's own movement can never look like the user taking over.
export function isUserScrollIntent(event: Event, panelHost: Element | null, container: Element | null): boolean {
  if (panelHost && event.composedPath().includes(panelHost)) return false;
  switch (event.type) {
    case "wheel":
    case "touchmove":
      return true;
    case "keydown": {
      const key = event as KeyboardEvent;
      return SCROLL_KEYS.has(key.key) && !key.ctrlKey && !key.metaKey && !key.altKey && !isEditable(key.target);
    }
    case "mousedown":
      // A press on the scrolling element itself, not its content, is a scrollbar drag.
      return event.target === container || event.target === document.documentElement;
    default:
      return false;
  }
}
