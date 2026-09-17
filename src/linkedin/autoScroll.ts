// Decides WHEN to programmatically scroll the profile page toward its bottom — never performs
// the actual scroll itself (that stays in content.ts, the one file allowed to touch the real
// DOM/window). Kept as its own pure, injectable-clock module for the same reason
// collectionEngine.ts is: unit-testable with fake time, no jsdom, no timers, no chrome APIs.
//
// Why this exists: LinkedIn lazy-loads most of a profile's sections only as they approach the
// viewport, so without SOME scrolling nothing below the fold ever gets collected. Manually
// scrolling was the only way to trigger that — this drives the same effect programmatically, in
// small controlled bursts rather than one jarring jump, so collection (and therefore analysis)
// starts the moment a profile page opens with an active goal, no user action required.
export interface AutoScrollOptions {
  now: () => number;
  /** Stop trying to scroll further after this long since the profile was first seen — matches
   * the "finish in ~10 seconds, or analyze with whatever's available rather than hang" goal.
   * Shared with the collection engine's own best-effort fallback (see content.ts) so both give
   * up at the same moment. */
  maxDurationMs?: number;
  /** Floor between one scroll-to-bottom call and the next, even if ticks fire faster — keeps
   * the motion controlled and readable instead of a jittery repeated scroll. */
  minIntervalMs?: number;
}

export interface AutoScrollDriver {
  /**
   * Call on every tick with the CURRENT profile key (resets all internal timing the moment this
   * changes), whether an active goal exists right now, and whether the page is already at its
   * real bottom. Returns true exactly when the caller should perform one scroll-to-bottom action.
   *
   * Deliberately scrolls at least once even when `atRealDocumentEnd` is already true on the very
   * first call for a profile — confirmed live, a profile's very first paint can already satisfy
   * "near the bottom" purely because nothing below the fold has been added to the DOM yet (no
   * scrollable overflow exists until something is), which would otherwise make this look
   * indistinguishable from "there's genuinely nothing more to load" and skip scrolling
   * altogether, without ever giving LinkedIn's own lazy-loading a chance to fire at all.
   * `atRealDocumentEnd` is honored as a stop condition only from the SECOND call onward, once at
   * least one real attempt has actually been made.
   */
  shouldScrollNow(profileKey: string | null, goalActive: boolean, atRealDocumentEnd: boolean): boolean;
  /** True once `maxDurationMs` has elapsed since `profileKey` was first seen — the "stop
   * waiting, analyze with whatever we have" signal, independent of whether a goal is active
   * (the elapsed-time clock for a profile starts the moment its page is seen, regardless of
   * whether scrolling for it was ever attempted). */
  hasTimedOut(profileKey: string | null): boolean;
  /** True once at least one scroll has actually been performed for `profileKey` — lets a caller
   * (see content.ts) withhold "we've reached the real end" from anything ELSE that depends on
   * it (the collection engine's own settle logic) until scrolling has had a genuine first
   * chance, for the exact reason described on `shouldScrollNow` above. */
  hasScrolledAtLeastOnce(profileKey: string | null): boolean;
}

const DEFAULT_MAX_DURATION_MS = 8000;
const DEFAULT_MIN_INTERVAL_MS = 700;

export function createAutoScrollDriver(options: AutoScrollOptions): AutoScrollDriver {
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = options.now;

  let currentKey: string | null = null;
  let startedAt = 0;
  // null (never scrolled for this profile yet) rather than 0 — 0 is a real timestamp a fake
  // clock in tests can genuinely start at, which would otherwise make the very first call look
  // like "we just scrolled a moment ago" and wrongly throttle it.
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
    if (!goalActive) return false;
    // Only a scroll we've actually already attempted can confirm "the end" — see this method's
    // doc comment for why the very first call ignores `atRealDocumentEnd` entirely.
    if (atRealDocumentEnd && lastScrollAt !== null) return false;
    if (now() - startedAt >= maxDurationMs) return false; // give up — the timeout fallback takes it from here
    if (lastScrollAt !== null && now() - lastScrollAt < minIntervalMs) return false;
    lastScrollAt = now();
    return true;
  }

  function hasTimedOut(profileKey: string | null): boolean {
    if (profileKey === null) return false;
    ensureTracking(profileKey);
    return now() - startedAt >= maxDurationMs;
  }

  function hasScrolledAtLeastOnce(profileKey: string | null): boolean {
    if (profileKey === null) return false;
    ensureTracking(profileKey);
    return lastScrollAt !== null;
  }

  return { shouldScrollNow, hasTimedOut, hasScrolledAtLeastOnce };
}
