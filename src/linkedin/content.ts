// The LinkWise content script — injected on every linkedin.com page (see manifest.json), and
// the home of the whole in-page panel (the panel's React tree is mounted from here — see
// panel/mount.ts — sharing this same JS realm, so no chrome.runtime messaging is needed between
// collection and the panel at all). The LinkWise opener is shown on every page; the collection
// engine only ever does real work while the current URL is a `/in/...` profile (see
// collectionEngine.ts's `onLeaveProfile`). Reads only what LinkedIn has already rendered; never
// fetches another page, never clicks anything.
//
// This script runs in one of two entirely separate modes, decided synchronously from the URL
// before anything else executes (see `IS_SCAN_TAB` below):
//
//   - Normal mode (the tab the user is actually looking at): never scrolls, never moves the
//     user's scroll position, period. When a profile opens with an active goal, it asks the
//     background service worker to scan that profile in a separate, inactive tab (see
//     backgroundScanProtocol.ts and background/backgroundScan.ts) and waits for the result —
//     the ONLY thing this mode does to get evidence. The page the user sees never jumps.
//   - Scan mode (a tab background/backgroundScan.ts created specifically for this, `active:
//     false`, never shown to the user): the one place this extension still auto-scrolls a page
//     (see autoScroll.ts) — invisible, since the tab is never in the foreground — to trigger
//     LinkedIn's lazy-loaded sections, then reports the collected evidence back and is closed.
//
// The two modes share the extraction/collection machinery (collectionEngine.ts,
// profileAdapter.ts) but have no other code paths in common — a scan tab never creates an
// opener or mounts the panel, and a normal tab never scrolls or calls the extractor itself.
import { createCollectionEngine } from "./collectionEngine";
import { detectProfileSections, extractLinkedInProfile, profileIdentityKey } from "./profileAdapter";
import { ensureLinkWiseOpener, removeLinkWiseOpener } from "./opener";
import { getPanelProfileData, setPanelProfileData } from "./panel/panelStore";
import { destroyPanel, togglePanel } from "./panel/mount";
import { installDevTooling } from "./devTools";
import { createAutoScrollDriver } from "./autoScroll";
import { ensureActiveGoalCriteria, getGoalStoreState, initGoalStore, selectActiveGoal, subscribeGoalStore } from "./panel/goalStore";
import { EMPTY_PROFILE, type LinkedInProfile } from "../models/profile";
import { initialCollectionState, type CollectionState } from "../models/collection";
import {
  getRequestingTabId,
  isScanTabUrl,
  SCAN_CANCEL,
  SCAN_FAILED,
  SCAN_REPORT,
  SCAN_REQUEST,
  SCAN_UPDATE,
  type ScanFailedMessage,
  type ScanRequestMessage,
  type ScanUpdateMessage,
} from "./backgroundScanProtocol";

/** How close to the bottom of the page counts as "reached the end," in pixels — tolerates
 * LinkedIn's footer/recommendation chrome without requiring a scroll to the literal last pixel.
 * Only relevant in scan mode; a normal tab never checks its own scroll position at all. */
const DOCUMENT_END_MARGIN_PX = 600;
/** LinkedIn's own DOM mutates frequently on its own (ads, badges, carousels); a short debounce
 * here made extraction run on nearly every mutation and visibly degraded page responsiveness
 * during testing, so this is deliberately wide. */
const MUTATION_DEBOUNCE_MS = 900;
const TICK_INTERVAL_MS = 2500;
/** Once settled, back off the safety-net tick — further changes are rare and a real navigation
 * is still caught faster by the mutation/scroll listeners below. */
const SETTLED_TICK_INTERVAL_MS = 6000;
/** How long auto-scroll (in a scan tab) keeps trying, and how long collection waits overall,
 * before giving up and reporting whatever has actually loaded — matches the "finish in about 10
 * seconds, or don't hang" goal. */
const AUTO_SCROLL_MAX_DURATION_MS = 8000;
/** A normal tab's own safety net on top of background/backgroundScan.ts's server-side timeout
 * (15s) — covers a lost service-worker restart mid-scan or an orphaned extension context (a
 * LinkedIn tab left open across a reload never gets any reply at all; see
 * ai/backgroundRelay.ts's doc comment for the same failure mode) by giving up locally rather
 * than waiting forever for a reply that may never come. Deliberately longer than the
 * background's own timeout so that one fires first in the normal case. */
const CLIENT_SCAN_TIMEOUT_MS = 20000;

const IS_SCAN_TAB = isScanTabUrl(location.href);

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

/** Debounced-mutation-observer + scroll-listener + backoff-interval loop shared by both modes —
 * only what each tick actually DOES differs between them. */
function watchForChanges(tick: () => void, watchScroll: boolean, getIsSettled: () => boolean): void {
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  const scheduleTick = () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(tick, MUTATION_DEBOUNCE_MS);
  };
  registerCleanup(() => {
    if (debounceHandle) clearTimeout(debounceHandle);
  });

  // Debounced: covers both new content loading in as the profile is scanned and LinkedIn's own
  // client-side navigation to a different profile.
  const observer = new MutationObserver(scheduleTick);
  observer.observe(document.body, { childList: true, subtree: true });
  registerCleanup(() => observer.disconnect());

  if (watchScroll) {
    // Scroll position matters for "has the page reached the end" independent of DOM mutations —
    // only meaningful in scan mode, where this script is the one doing the scrolling. A capture-
    // phase listener on `document` observes it regardless of which element actually scrolls (see
    // findScrollContainer below).
    window.addEventListener("scroll", scheduleTick, { passive: true });
    registerCleanup(() => window.removeEventListener("scroll", scheduleTick));
    document.addEventListener("scroll", scheduleTick, { passive: true, capture: true });
    registerCleanup(() => document.removeEventListener("scroll", scheduleTick, true));
  }

  // Periodic safety net: catches the settle transition, which depends on elapsed quiet time
  // rather than any mutation or scroll event firing on its own.
  let intervalHandle = setInterval(runIntervalTick, TICK_INTERVAL_MS);
  registerCleanup(() => clearInterval(intervalHandle));
  function runIntervalTick(): void {
    const wasSettled = getIsSettled();
    tick();
    const isSettled = getIsSettled();
    if (isSettled !== wasSettled) {
      clearInterval(intervalHandle);
      intervalHandle = setInterval(runIntervalTick, isSettled ? SETTLED_TICK_INTERVAL_MS : TICK_INTERVAL_MS);
    }
  }
}

function bootScanTab(): void {
  function findScrollContainer(): Element {
    const candidates = [document.scrollingElement, document.querySelector("main")].filter(
      (el): el is Element => el != null,
    );
    for (const candidate of candidates) {
      if (candidate.scrollHeight - candidate.clientHeight > 40) return candidate;
    }
    return document.scrollingElement ?? document.documentElement;
  }

  /** LinkedIn's profile page does not always scroll the window/document itself — confirmed
   * live, `document.body` can have `overflow-y: hidden` with the actual profile content
   * scrolling inside `<main>` instead. `findScrollContainer` picks whichever real candidate
   * actually has scrollable overflow right now, rather than hardcoding `<main>`. */
  function isNearDocumentEnd(): boolean {
    const el = findScrollContainer();
    return el.scrollTop + el.clientHeight >= el.scrollHeight - DOCUMENT_END_MARGIN_PX;
  }

  const autoScroll = createAutoScrollDriver({ now: () => Date.now(), maxDurationMs: AUTO_SCROLL_MAX_DURATION_MS });

  /** Fed to the collection engine as its own "have we reached the end" signal. Deliberately
   * withholds a real `isNearDocumentEnd()` reading of true until auto-scroll has actually
   * attempted at least one scroll — confirmed live, a profile's very first paint can already
   * satisfy "near the bottom" purely because nothing below the fold exists in the DOM yet, which
   * would otherwise let collection settle immediately with just the initial above-the-fold
   * content and never give auto-scroll (see autoScroll.ts's own doc comment) any chance to run
   * at all. */
  function isNearDocumentEndOrTimedOut(): boolean {
    const profileKey = engine.getProfileKey();
    if (autoScroll.hasTimedOut(profileKey)) return true;
    if (!autoScroll.hasScrolledAtLeastOnce(profileKey)) return false;
    return isNearDocumentEnd();
  }

  let lastKnownProfileKey: string | null = null;
  // Read once, synchronously, from this scan tab's own URL — the SAME tab id background used to
  // create it (see backgroundScanProtocol.ts's `buildScanUrl`/`getRequestingTabId`). Echoed back
  // on every report so relaying never depends on the background service worker's own in-memory
  // job bookkeeping having survived since this tab was created — see ScanReportMessage's doc
  // comment on `requestingTabId` for why that matters.
  const requestingTabId = getRequestingTabId(location.href);

  function report(profileKey: string, profile: LinkedInProfile, collection: CollectionState): void {
    if (requestingTabId === null) return; // malformed scan URL — nowhere to report to; shouldn't happen
    chrome.runtime.sendMessage({ type: SCAN_REPORT, profileKey, profile, collection, requestingTabId }).catch(() => {
      // The background service worker may be mid-restart, or the requesting tab it was relaying
      // to is already gone — either way, this scan tab has nothing further useful to do; it will
      // be cleaned up by background/backgroundScan.ts's own timeout regardless.
    });
  }

  const engine = createCollectionEngine({
    now: () => Date.now(),
    extractProfile: () => extractLinkedInProfile(document),
    detectSections: () => detectProfileSections(document),
    getProfileKey: () => profileIdentityKey(location.href),
    isNearDocumentEnd: isNearDocumentEndOrTimedOut,
    onUpdate: (profileKey, profile, collection) => report(profileKey, profile, collection),
    onReset: (profileKey) => {
      lastKnownProfileKey = profileKey;
      report(profileKey, EMPTY_PROFILE, initialCollectionState(Date.now()));
    },
    onLeaveProfile: () => {
      // Should not normally happen — a scan tab's URL never changes after creation — but if
      // LinkedIn ever redirects it away (a login/checkpoint interstitial, a removed profile),
      // report a settled, empty result rather than leaving the requester waiting forever.
      if (!lastKnownProfileKey) return;
      report(lastKnownProfileKey, EMPTY_PROFILE, { ...initialCollectionState(Date.now()), status: "settled" });
      lastKnownProfileKey = null;
    },
  });

  function tick(): void {
    engine.tick();
    const profileKey = engine.getProfileKey();
    if (autoScroll.shouldScrollNow(profileKey, true, isNearDocumentEnd())) {
      const container = findScrollContainer();
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }

  tick();
  watchForChanges(tick, true, () => engine.getCollectionState().status === "settled");
  window.__linkwiseTeardown__ = () => {
    cleanupFns.forEach((fn) => fn());
  };
}

function bootNormalTab(): void {
  /** Evidence for the CURRENT page load, per profile key — reused instantly (no rescan) when
   * the same profile is revisited within this content-script instance's lifetime, or when only
   * the active goal/criteria changes while the profile stays the same. Cleared naturally on a
   * fresh page load/reinjection (a brand-new module instance starts with an empty map). */
  const scanCache = new Map<string, { profile: LinkedInProfile; collection: CollectionState }>();
  const scanInFlight = new Set<string>();
  let lastAppliedCacheKey: string | null = null;

  function applyToPanel(profileKey: string, profile: LinkedInProfile, collection: CollectionState): void {
    lastAppliedCacheKey = profileKey;
    setPanelProfileData({ profileKey, profile, collection });
  }

  function cancelInFlightScanFor(profileKey: string | null): void {
    if (!profileKey || !scanInFlight.has(profileKey)) return;
    scanInFlight.delete(profileKey);
    try {
      chrome.runtime.sendMessage({ type: SCAN_CANCEL, profileKey }).catch(() => {});
    } catch {
      // Orphaned extension context — there's no receiver left to cancel anyway.
    }
  }

  function requestBackgroundScan(profileKey: string): void {
    try {
      chrome.runtime
        .sendMessage({ type: SCAN_REQUEST, profileKey } satisfies ScanRequestMessage)
        .catch(() => scanInFlight.delete(profileKey));
    } catch {
      scanInFlight.delete(profileKey);
      return;
    }

    const timeoutId = setTimeout(() => {
      if (!scanInFlight.has(profileKey)) return; // already resolved one way or another
      scanInFlight.delete(profileKey);
      if (engine.getProfileKey() === profileKey && !scanCache.has(profileKey)) {
        const fallback = { profile: EMPTY_PROFILE, collection: { ...initialCollectionState(Date.now()), status: "settled" as const } };
        scanCache.set(profileKey, fallback);
        applyToPanel(profileKey, fallback.profile, fallback.collection);
      }
    }, CLIENT_SCAN_TIMEOUT_MS);
    registerCleanup(() => clearTimeout(timeoutId));
  }

  const engine = createCollectionEngine({
    now: () => Date.now(),
    // A normal tab never reads its own DOM for evidence — all evidence comes from a scan tab's
    // relayed report (see handleBackgroundMessage below). This engine instance exists here only
    // to reuse its already-tested profile-key/navigation bookkeeping (onReset/onLeaveProfile);
    // its extraction always reports "nothing changed," so onUpdate below is never actually
    // reachable in practice.
    extractProfile: () => EMPTY_PROFILE,
    detectSections: () => [],
    getProfileKey: () => profileIdentityKey(location.href),
    isNearDocumentEnd: () => false,
    onUpdate: () => {},
    onReset: (profileKey) => {
      cancelInFlightScanFor(trackedProfileKey);
      trackedProfileKey = profileKey;
      lastAppliedCacheKey = null;
      setPanelProfileData({ profileKey, profile: null, collection: null });
    },
    onLeaveProfile: () => {
      cancelInFlightScanFor(trackedProfileKey);
      trackedProfileKey = null;
      lastAppliedCacheKey = null;
      setPanelProfileData({ profileKey: null, profile: null, collection: null });
    },
  });

  let trackedProfileKey: string | null = null;

  function handleBackgroundMessage(message: unknown): void {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const currentKey = engine.getProfileKey();

    if ((message as { type: unknown }).type === SCAN_UPDATE) {
      const { profileKey, profile, collection } = message as ScanUpdateMessage;
      scanCache.set(profileKey, { profile, collection });
      if (collection.status === "settled") scanInFlight.delete(profileKey);
      if (profileKey === currentKey) applyToPanel(profileKey, profile, collection);
      return;
    }

    if ((message as { type: unknown }).type === SCAN_FAILED) {
      const { profileKey } = message as ScanFailedMessage;
      scanInFlight.delete(profileKey);
      if (profileKey !== currentKey) return;
      const fallback =
        scanCache.get(profileKey) ??
        ({ profile: EMPTY_PROFILE, collection: { ...initialCollectionState(Date.now()), status: "settled" as const } } as const);
      scanCache.set(profileKey, fallback);
      applyToPanel(profileKey, fallback.profile, fallback.collection);
    }
  }
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  registerCleanup(() => chrome.runtime.onMessage.removeListener(handleBackgroundMessage));

  /** The opener button is re-verified on every tick rather than injected only once, so it
   * self-heals if LinkedIn's own SPA rendering were ever to remove it from `document.body`. */
  function tick(): void {
    ensureLinkWiseOpener(togglePanel);
    engine.tick();

    const goal = selectActiveGoal(getGoalStoreState());
    // Runs regardless of whether a profile is even open — self-heals an active goal that has a
    // stored description but no scoreable criteria (see goalStore.ts's own doc comment on why
    // that can happen) BEFORE the user ever opens one, so a background scan started moments
    // later already has real criteria to score against instead of racing the repair.
    if (goal) ensureActiveGoalCriteria();

    const profileKey = engine.getProfileKey();
    if (profileKey === null) return;
    if (!goal) return;

    const cached = scanCache.get(profileKey);
    if (cached) {
      if (lastAppliedCacheKey !== profileKey) applyToPanel(profileKey, cached.profile, cached.collection);
      return;
    }

    if (scanInFlight.has(profileKey)) return;
    scanInFlight.add(profileKey);
    requestBackgroundScan(profileKey);
  }

  // Loaded here (not only from the panel's own useGoalStore()) so an active goal from a previous
  // session is known immediately, before the user ever opens the panel — a background scan can
  // then already be under way by the time they do open it, instead of only starting at that
  // point. Safe to call from both places: idempotent, and this module-level store has exactly
  // one underlying state regardless of how many callers initialize it.
  initGoalStore();
  registerCleanup(subscribeGoalStore(tick));

  tick();
  watchForChanges(tick, false, () => false);
  registerCleanup(installDevTooling(() => getPanelProfileData()));

  window.__linkwiseTeardown__ = () => {
    cleanupFns.forEach((fn) => fn());
    removeLinkWiseOpener();
    destroyPanel();
  };
}

if (IS_SCAN_TAB) {
  bootScanTab();
} else {
  bootNormalTab();
}
