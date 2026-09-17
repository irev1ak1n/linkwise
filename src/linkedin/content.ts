// The LinkWise content script — injected on every linkedin.com page (see manifest.json), and
// the home of the whole in-page panel (the panel's React tree is mounted from here — see
// panel/mount.ts — sharing this same JS realm, so no chrome.runtime messaging is needed between
// collection and the panel at all). The LinkWise opener is shown on every page; the collection
// engine only ever does real work while the current URL is a `/in/...` profile — everywhere
// else it simply stays idle (see collectionEngine.ts's `onLeaveProfile`). Reads only what
// LinkedIn has already rendered; never fetches another page, never clicks anything.
//
// One deliberate, bounded exception to "never scrolls on the user's behalf": while a profile
// page is open AND an active goal already exists, this script scrolls the page toward its
// bottom itself (see autoScroll.ts) so LinkedIn's lazy-loaded sections load without the user
// needing to scroll manually — the whole point of automatic analysis. It is intentionally
// small, controlled bursts toward whatever the CURRENT bottom is (never a single jump to an
// assumed end), bounded to a few seconds total, and only ever runs when there's an active goal
// to actually analyze against.
import { createCollectionEngine } from "./collectionEngine";
import { detectProfileSections, extractLinkedInProfile, profileIdentityKey } from "./profileAdapter";
import { ensureLinkWiseOpener, removeLinkWiseOpener } from "./opener";
import { getPanelProfileData, setPanelProfileData } from "./panel/panelStore";
import { destroyPanel, togglePanel } from "./panel/mount";
import { installDevTooling } from "./devTools";
import { createAutoScrollDriver } from "./autoScroll";
import { getGoalStoreState, initGoalStore, selectActiveGoal, subscribeGoalStore } from "./panel/goalStore";

/** How close to the bottom of the page counts as "reached the end," in pixels — tolerates
 * LinkedIn's footer/recommendation chrome without requiring a scroll to the literal last pixel. */
const DOCUMENT_END_MARGIN_PX = 600;
/** LinkedIn's own DOM mutates frequently on its own (ads, badges, carousels); a short debounce
 * here made extraction run on nearly every mutation and visibly degraded page responsiveness
 * during testing, so this is deliberately wide. */
const MUTATION_DEBOUNCE_MS = 900;
const TICK_INTERVAL_MS = 2500;
/** Once settled, back off the safety-net tick — further changes are rare and a real navigation
 * is still caught faster by the mutation/scroll listeners below. */
const SETTLED_TICK_INTERVAL_MS = 6000;
/** How long auto-scroll keeps trying, and how long collection waits overall, before giving up
 * and analyzing with whatever has actually loaded — matches the "finish in about 10 seconds, or
 * don't hang" goal: a few seconds of scrolling/loading here, leaving the rest of the ~10s budget
 * for the analysis call itself. */
const AUTO_SCROLL_MAX_DURATION_MS = 8000;

declare global {
  interface Window {
    /** Set at the end of every run of this script; a fresh injection calls it before doing
     * anything else. Content scripts re-injected into an already-open tab (a development
     * reload via devTools.ts, or any future `chrome.scripting.executeScript` re-injection) get
     * an entirely new JS realm with its own timers/observers/closures — nothing about a fresh
     * injection can reach into a previous one to stop it, EXCEPT the one thing every injection
     * shares: this same `window` object. Without this, reloading the extension while a tab is
     * already open would leave the old instance's interval/MutationObserver running forever
     * alongside the new one, and could leave a duplicate opener button or panel host behind. */
    __linkwiseTeardown__?: () => void;
  }
}

window.__linkwiseTeardown__?.();
const cleanupFns: (() => void)[] = [];
function registerCleanup(fn: () => void): void {
  cleanupFns.push(fn);
}

function findScrollContainer(): Element {
  const candidates = [document.scrollingElement, document.querySelector("main")].filter(
    (el): el is Element => el != null, // `document.scrollingElement` can be undefined, not just null
  );
  for (const candidate of candidates) {
    if (candidate.scrollHeight - candidate.clientHeight > 40) return candidate;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** LinkedIn's profile page does not always scroll the window/document itself — confirmed live,
 * `document.body` can have `overflow-y: hidden` with the actual profile content scrolling
 * inside `<main>` instead, which would make `window.scrollY`/`document.documentElement.
 * scrollHeight` permanently report "already at the bottom" from the very first tick,
 * regardless of real content or scrolling. `findScrollContainer` picks whichever real
 * candidate actually has scrollable overflow right now, rather than hardcoding `<main>`. */
function isNearDocumentEnd(): boolean {
  const el = findScrollContainer();
  return el.scrollTop + el.clientHeight >= el.scrollHeight - DOCUMENT_END_MARGIN_PX;
}

const autoScroll = createAutoScrollDriver({ now: () => Date.now(), maxDurationMs: AUTO_SCROLL_MAX_DURATION_MS });

/** The signal actually fed to the collection engine: real scroll position OR — once
 * `AUTO_SCROLL_MAX_DURATION_MS` has passed for this profile — a best-effort "good enough, stop
 * waiting" override, so a profile that can't be fully auto-scrolled (an unusual layout, a very
 * long page) still reaches a final analysis instead of hanging in "collecting" forever. */
function isNearDocumentEndOrTimedOut(): boolean {
  return isNearDocumentEnd() || autoScroll.hasTimedOut(engine.getProfileKey());
}

const engine = createCollectionEngine({
  now: () => Date.now(),
  extractProfile: () => extractLinkedInProfile(document),
  detectSections: () => detectProfileSections(document),
  getProfileKey: () => profileIdentityKey(location.href),
  isNearDocumentEnd: isNearDocumentEndOrTimedOut,
  onUpdate: (profileKey, profile, collection) => {
    setPanelProfileData({ profileKey, profile, collection });
  },
  onReset: (profileKey) => {
    // A genuine navigation to a different profile — clear the displayed profile immediately so
    // the panel never shows a moment of the previous person's evidence.
    setPanelProfileData({ profileKey, profile: null, collection: null });
  },
  onLeaveProfile: () => {
    // Navigated to a non-profile LinkedIn page (feed, jobs, search, …) — `profileKey: null` is
    // what PanelApp reads to show its neutral "open a profile to analyze it" state instead of
    // a stale scanning/analysis view for whoever was last viewed.
    setPanelProfileData({ profileKey: null, profile: null, collection: null });
  },
});

/** The opener button is re-verified on every tick rather than injected only once, so it
 * self-heals if LinkedIn's own SPA rendering were ever to remove it from `document.body`. */
function tick(): void {
  ensureLinkWiseOpener(togglePanel);
  engine.tick();

  const goalActive = selectActiveGoal(getGoalStoreState()) !== null;
  if (autoScroll.shouldScrollNow(engine.getProfileKey(), goalActive, isNearDocumentEnd())) {
    const container = findScrollContainer();
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }
}

function watchForChanges(): void {
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  const scheduleTick = () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(tick, MUTATION_DEBOUNCE_MS);
  };
  registerCleanup(() => {
    if (debounceHandle) clearTimeout(debounceHandle);
  });

  // Debounced: covers both new content loading in as the user scrolls and LinkedIn's own
  // client-side navigation to a different profile.
  const observer = new MutationObserver(scheduleTick);
  observer.observe(document.body, { childList: true, subtree: true });
  registerCleanup(() => observer.disconnect());

  // Scroll position matters for "has the user reached the end" independent of DOM mutations.
  // A scroll inside an inner container (see findScrollContainer above) never bubbles to
  // window, but a capture-phase listener on `document` still observes it regardless of which
  // element actually scrolls — covers both LinkedIn's inner-container layout and a plain
  // window-scrolling page, without needing to know in advance which one applies.
  window.addEventListener("scroll", scheduleTick, { passive: true });
  registerCleanup(() => window.removeEventListener("scroll", scheduleTick));
  document.addEventListener("scroll", scheduleTick, { passive: true, capture: true });
  registerCleanup(() => document.removeEventListener("scroll", scheduleTick, true));

  // Periodic safety net: catches the settle transition, which depends on elapsed quiet time
  // rather than any mutation or scroll event firing on its own.
  let intervalHandle = setInterval(runIntervalTick, TICK_INTERVAL_MS);
  registerCleanup(() => clearInterval(intervalHandle));
  function runIntervalTick(): void {
    const wasSettled = engine.getCollectionState().status === "settled";
    tick();
    const isSettled = engine.getCollectionState().status === "settled";
    if (isSettled !== wasSettled) {
      clearInterval(intervalHandle);
      intervalHandle = setInterval(runIntervalTick, isSettled ? SETTLED_TICK_INTERVAL_MS : TICK_INTERVAL_MS);
    }
  }
}

// Loaded here (not only from the panel's own useGoalStore()) so an active goal from a previous
// session is known immediately, before the user ever opens the panel — collection/auto-scroll
// can then already be under way by the time they do open it, instead of only starting at that
// point. Safe to call from both places: idempotent, and this module-level store has exactly one
// underlying state regardless of how many callers initialize it.
initGoalStore();
registerCleanup(subscribeGoalStore(tick));

tick();
watchForChanges();
registerCleanup(installDevTooling(() => getPanelProfileData()));

window.__linkwiseTeardown__ = () => {
  cleanupFns.forEach((fn) => fn());
  removeLinkWiseOpener();
  destroyPanel();
};
