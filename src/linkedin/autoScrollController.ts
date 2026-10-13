// Moves whichever page is open, main profile or a section, for Auto scan: most of a screen at a
// time, with a pause for lazy content to load. Only moves the page; extraction and analysis stay
// on their own debounced ticks.
export type AutoScrollStatus = "idle" | "running" | "complete";

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
}

export const STEP_FRACTION = 0.85;
export const STEP_INTERVAL_MS = 900;
// LinkedIn keeps loading content near the bottom, so the end only counts once it stops growing.
export const END_WAIT_MS = 2000;

export function createAutoScrollController(deps: AutoScrollDeps) {
  let state: AutoScrollState = { status: "idle", target: null };
  let lastStepAt: number | null = null;
  const listeners = new Set<() => void>();
  let getContainer: () => ScrollContainer = () => ({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  let frame: unknown = null;
  let atEndSince: number | null = null;
  let anchored: { el: ScrollContainer; previous: string } | null = null;

  // Scroll anchoring would jump the view past sections LinkedIn renders above its anchor. LinkedIn
  // can also replace the scrolling element mid-scan, so this follows whichever one is current.
  function holdAnchoring(): void {
    const el = getContainer();
    if (anchored?.el === el) return;
    releaseAnchoring();
    if (!el.style) return;
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
    atEndSince = null;
  }

  function schedule(): void {
    holdAnchoring();
    if (frame === null) frame = deps.requestFrame(step);
  }

  function step(): void {
    frame = null;
    if (state.status !== "running") return;
    holdAnchoring();
    const el = getContainer();
    const now = deps.now();

    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
      atEndSince ??= now;
      if (now - atEndSince >= END_WAIT_MS) {
        stopFrames();
        setState({ ...state, status: "complete" });
        return;
      }
    } else {
      atEndSince = null;
      if (lastStepAt === null || now - lastStepAt >= STEP_INTERVAL_MS) {
        lastStepAt = now;
        el.scrollTop += Math.round(el.clientHeight * STEP_FRACTION);
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
    /** Scans `target` once; later calls for the same target never restart it. */
    start(target: string, container: () => ScrollContainer): void {
      if (state.target === target && state.status !== "idle") return;
      stopFrames();
      getContainer = container;
      lastStepAt = null;
      setState({ status: "running", target });
      schedule();
    },
    reset(): void {
      stopFrames();
      setState({ status: "idle", target: null });
    },
  };
}

export type AutoScrollController = ReturnType<typeof createAutoScrollController>;
