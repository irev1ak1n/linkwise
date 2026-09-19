// Decides when to scroll the profile page, never performs the scroll itself (that's
// content.ts). A pure, injectable-clock module so it's testable without jsdom or timers.
//
// LinkedIn lazy-loads sections as they near the viewport, so without scrolling nothing below
// the fold gets collected. This drives that automatically, in small bursts, no user action
// needed.
export interface AutoScrollOptions {
  now: () => number;
  /** Stop trying to scroll further after this long, give up and analyze with what we have. */
  maxDurationMs?: number;
  /** Floor between one scroll and the next, so it stays controlled instead of jittery. */
  minIntervalMs?: number;
}

export interface AutoScrollDriver {
  /** Call on every tick. Returns true when the caller should scroll once. Resets its timing
   * whenever profileKey changes. */
  shouldScrollNow(profileKey: string | null, goalActive: boolean, atRealDocumentEnd: boolean): boolean;
  /** True once maxDurationMs has elapsed since this profile was first seen. */
  hasTimedOut(profileKey: string | null): boolean;
}

const DEFAULT_MAX_DURATION_MS = 8000;
const DEFAULT_MIN_INTERVAL_MS = 700;

export function createAutoScrollDriver(options: AutoScrollOptions): AutoScrollDriver {
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = options.now;

  let currentKey: string | null = null;
  let startedAt = 0;
  // null means never scrolled yet. 0 is a real timestamp a fake clock could start at, which
  // would wrongly throttle the very first call.
  let lastScrollAt: number | null = null;

  function ensureTracking(profileKey: string): void {
    if (profileKey === currentKey) return;
    currentKey = profileKey;
    startedAt = now();
    lastScrollAt = null;
  }

  function shouldScrollNow(profileKey: string | null, goalActive: boolean, atRealDocumentEnd: boolean): boolean {
    if (profileKey === null) return false;
    ensureTracking(profileKey);
    if (!goalActive || atRealDocumentEnd) return false;
    if (now() - startedAt >= maxDurationMs) return false; // give up, the timeout fallback takes it from here
    if (lastScrollAt !== null && now() - lastScrollAt < minIntervalMs) return false;
    lastScrollAt = now();
    return true;
  }

  function hasTimedOut(profileKey: string | null): boolean {
    if (profileKey === null) return false;
    ensureTracking(profileKey);
    return now() - startedAt >= maxDurationMs;
  }

  return { shouldScrollNow, hasTimedOut };
}
