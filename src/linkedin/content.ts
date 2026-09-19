// The LinkWise content script, injected on every linkedin.com page. Home of the in-page panel,
// mounted here so it shares this JS realm with collection (see panel/mount.ts). The opener
// shows on every page, but collection only runs on a /in/... profile. Never fetches another
// page or clicks anything.
//
// Two scanning modes, user-selectable (see panel/scanModeStore.ts): "scroll" (default) never
// moves the page and settles as soon as useful evidence exists; "auto" scrolls the page toward
// the bottom itself (see autoScroll.ts) so lazy-loaded sections load without the user
// scrolling, then restores the original scroll position once settled.
import { foundSections, type LinkedInProfile } from "../models/profile";
import { createCollectionEngine } from "./collectionEngine";
import { detectProfileSections, extractLinkedInProfile, profileIdentityKey } from "./profileAdapter";
import { ensureLinkWiseOpener, removeLinkWiseOpener } from "./opener";
import { getPanelProfileData, setPanelProfileData } from "./panel/panelStore";
import { destroyPanel, togglePanel } from "./panel/mount";
import { installDevTooling } from "./devTools";
import { createAutoScrollDriver } from "./autoScroll";
import { getGoalStoreState, initGoalStore, selectActiveGoal, subscribeGoalStore } from "./panel/goalStore";
import { getScanModeState, initScanModeStore, subscribeScanModeStore } from "./panel/scanModeStore";

// How close to the bottom counts as "reached the end," tolerates LinkedIn's footer chrome.
const DOCUMENT_END_MARGIN_PX = 600;
// LinkedIn's DOM mutates a lot on its own, a short debounce here hurt page responsiveness.
const MUTATION_DEBOUNCE_MS = 900;
const TICK_INTERVAL_MS = 2500;
// Once settled, back off the safety-net tick since further changes are rare.
const SETTLED_TICK_INTERVAL_MS = 6000;
// How long auto-scroll keeps trying before giving up and analyzing with what's loaded.
const AUTO_SCROLL_MAX_DURATION_MS = 8000;

declare global {
  interface Window {
    /** Set at the end of every run, a fresh injection calls it first to stop the old one.
     * Re-injection gets a whole new JS realm, so window is the only thing shared between them. */
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
    (el): el is Element => el != null, // scrollingElement can be undefined, not just null
  );
  for (const candidate of candidates) {
    if (candidate.scrollHeight - candidate.clientHeight > 40) return candidate;
  }
  return document.scrollingElement ?? document.documentElement;
}

// LinkedIn doesn't always scroll the document itself, sometimes the content scrolls inside
// <main> instead. findScrollContainer picks whichever one actually has scrollable overflow.
function isNearDocumentEnd(): boolean {
  const el = findScrollContainer();
  return el.scrollTop + el.clientHeight >= el.scrollHeight - DOCUMENT_END_MARGIN_PX;
}

const autoScroll = createAutoScrollDriver({ now: () => Date.now(), maxDurationMs: AUTO_SCROLL_MAX_DURATION_MS });

// Real scroll position, or a timeout override so a profile that can't fully auto-scroll
// still reaches a final analysis instead of hanging. Only meaningful in "auto" mode.
function isNearDocumentEndOrTimedOut(): boolean {
  return isNearDocumentEnd() || autoScroll.hasTimedOut(engine.getProfileKey());
}

// In "scroll" mode there's no auto-scroll timeout to fall back on, so settling instead allows
// any real evidence beyond bare identity (name/headline) once things go quiet, rather than
// waiting for the user to reach the actual bottom.
function hasEnoughEvidenceToSettle(profile: LinkedInProfile): boolean {
  return getScanModeState().mode === "scroll" && profile.extracted && foundSections(profile).length > 0;
}

// The user's scroll position before an "auto" scan started, restored once it settles.
const savedScrollPositions = new Map<string, number>();
const restoredProfileKeys = new Set<string>();

function maybeRestoreScrollPosition(profileKey: string): void {
  if (restoredProfileKeys.has(profileKey)) return;
  restoredProfileKeys.add(profileKey);
  const savedTop = savedScrollPositions.get(profileKey);
  if (savedTop === undefined) return;
  const container = findScrollContainer();
  if (Math.abs(container.scrollTop - savedTop) < 2) return; // already there
  container.scrollTo({ top: savedTop, behavior: "smooth" });
}

const engine = createCollectionEngine({
  now: () => Date.now(),
  extractProfile: () => extractLinkedInProfile(document),
  detectSections: () => detectProfileSections(document),
  getProfileKey: () => profileIdentityKey(location.href),
  isNearDocumentEnd: () => (getScanModeState().mode === "auto" ? isNearDocumentEndOrTimedOut() : isNearDocumentEnd()),
  hasEnoughEvidence: hasEnoughEvidenceToSettle,
  onUpdate: (profileKey, profile, collection) => {
    setPanelProfileData({ profileKey, profile, collection });
  },
  onReset: (profileKey) => {
    // A navigation to a different profile, clear the old evidence right away and remember
    // where the user was before any auto-scrolling starts.
    savedScrollPositions.set(profileKey, findScrollContainer().scrollTop);
    setPanelProfileData({ profileKey, profile: null, collection: null });
  },
  onLeaveProfile: () => {
    // Navigated to a non-profile page, null profileKey shows the neutral empty state.
    setPanelProfileData({ profileKey: null, profile: null, collection: null });
  },
});

// Re-verified every tick so it self-heals if LinkedIn's SPA ever removes it.
function tick(): void {
  ensureLinkWiseOpener(togglePanel);
  engine.tick();

  const profileKey = engine.getProfileKey();
  if (profileKey === null) return;

  if (engine.getCollectionState().status === "settled") {
    // Never scroll again once settled, whichever mode produced that, this also prevents a
    // duplicate auto scan and lets a goal change reuse the evidence without rescrolling.
    if (getScanModeState().mode === "auto") maybeRestoreScrollPosition(profileKey);
    return;
  }

  if (getScanModeState().mode !== "auto") return; // "scroll" mode never moves the page

  const goalActive = selectActiveGoal(getGoalStoreState()) !== null;
  if (autoScroll.shouldScrollNow(profileKey, goalActive, isNearDocumentEnd())) {
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

  // Covers both new content loading in and LinkedIn's own client-side navigation.
  const observer = new MutationObserver(scheduleTick);
  observer.observe(document.body, { childList: true, subtree: true });
  registerCleanup(() => observer.disconnect());

  // A capture-phase listener on document catches scrolling inside an inner container too,
  // not just window scrolling.
  window.addEventListener("scroll", scheduleTick, { passive: true });
  registerCleanup(() => window.removeEventListener("scroll", scheduleTick));
  document.addEventListener("scroll", scheduleTick, { passive: true, capture: true });
  registerCleanup(() => document.removeEventListener("scroll", scheduleTick, true));

  // Catches the settle transition, which depends on elapsed quiet time, not an event firing.
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

// Loaded here too (not just useGoalStore()) so an active goal is known before the panel opens,
// letting collection/auto-scroll start immediately. Idempotent, safe to call from both places.
initGoalStore();
registerCleanup(subscribeGoalStore(tick));

// Loaded here too so a switch to "auto" mid-browsing starts scrolling on the very next tick,
// without resetting whatever evidence is already collected.
initScanModeStore();
registerCleanup(subscribeScanModeStore(tick));

tick();
watchForChanges();
registerCleanup(installDevTooling(() => getPanelProfileData()));

window.__linkwiseTeardown__ = () => {
  cleanupFns.forEach((fn) => fn());
  removeLinkWiseOpener();
  destroyPanel();
};
