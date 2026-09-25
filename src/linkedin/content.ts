// The LinkWise content script, injected on every linkedin.com page. Home of the in-page panel,
// mounted here so it shares this JS realm with collection (see panel/mount.ts). The opener
// shows on every page, but collection only runs on a /in/... profile. Never fetches another
// page or clicks anything beyond a safe "see more" toggle.
//
// Jobs filtering (see jobs/jobsRuntime.ts) is a separate feature, only active on a jobs search
// page, driven from the same tick loop below.
//
// Two scanning modes, user-selectable (see panel/scanModeStore.ts): "scroll" (default) never
// moves the page, it only ever reacts to sections the user reveals by scrolling manually.
// "auto" is the only mode allowed to scroll the page itself (see autoScroll.ts), so lazy-loaded
// sections load without the user scrolling, then the original scroll position is restored once
// the scan completes.
//
// Whether to attempt auto-scroll is decided in exactly one place, scanCoverage.ts's
// shouldAttemptAutoScroll(mode, coverage). A Match % existing is not the same as the profile
// being fully covered (see scanCoverage.ts), so that decision reads collection state, never the
// analysis result. autoScroll.ts also refuses to scroll unless mode is "auto", as a second,
// independent gate in case some future caller skips the check above.
//
// Once the main page is fully covered, "auto" mode also visits this person's own
// "/details/{section}/" pages one at a time — but only when Enhanced analysis is on (see
// enhancedAnalysisStore.ts); off, Auto scan stops at the main page. See autoScanSession.ts for
// the persisted, frozen-queue checklist that drives the crawl, and tickAutoScanCrawl below for
// the navigation itself. Local code always controls navigation; OpenAI never decides which page
// to visit next.
//
// "See more" expansion (expandContent.ts) uses one shared safety system regardless of mode:
// Auto scan always expands safe profile-information toggles, "Analyze as I scroll" only does
// when the user has turned that on (see expandDetailsStore.ts). Neither mode ever expands a
// control outside a recognized profile section.
import { EMPTY_PROFILE, foundSections, type LinkedInProfile } from "../models/profile";
import { createCollectionEngine } from "./collectionEngine";
import { deriveScanCoverage, shouldAttemptAutoScroll } from "./scanCoverage";
import { detectProfileSections, extractLinkedInProfile, normalizeProfileUrl, profileIdentityKey } from "./profileAdapter";
import { discoverProfileSections, excludeFromAutoScanQueue } from "./sectionDiscovery";
import { mergeProfileEvidence } from "./profileEvidenceAccumulator";
import {
  forceCompleteSession,
  hasExceededOverallTimeout,
  isSessionComplete,
  markCurrentSectionDone,
  markCurrentSectionFailed,
  markCurrentSectionScanning,
  nextPendingSection,
  startAutoScanSession,
  type AutoScanSession,
} from "./autoScanSession";
import { loadAutoScanSession, saveAutoScanSession } from "../storage/autoScanSessionRepository";
import { loadProfileEvidence, saveProfileEvidence } from "../storage/profileEvidenceRepository";
import { ensureLinkWiseOpener, removeLinkWiseOpener } from "./opener";
import { getPanelProfileData, setPanelProfileData, type AutoScanProgress } from "./panel/panelStore";
import { destroyPanel, togglePanel } from "./panel/mount";
import { installDevTooling } from "./devTools";
import { createAutoScrollDriver } from "./autoScroll";
import { getGoalStoreState, initGoalStore, selectActiveGoal, subscribeGoalStore } from "./panel/goalStore";
import { getScanModeState, initScanModeStore, subscribeScanModeStore, type ScanMode } from "./panel/scanModeStore";
import { getExpandDetailsState, initExpandDetailsStore, subscribeExpandDetailsStore } from "./panel/expandDetailsStore";
import { getEnhancedAnalysisState, initEnhancedAnalysisStore, subscribeEnhancedAnalysisStore } from "./panel/enhancedAnalysisStore";
import { expandSeeMoreToggles } from "./expandContent";
import { getJobsSettingsState, initJobsSettingsStore, subscribeJobsSettingsStore } from "./panel/jobsSettingsStore";
import { runJobsTick } from "./jobs/jobsRuntime";

const DOCUMENT_END_MARGIN_PX = 600;
const MUTATION_DEBOUNCE_MS = 900;
const TICK_INTERVAL_MS = 2500;
const SETTLED_TICK_INTERVAL_MS = 6000;
const AUTO_SCROLL_MAX_DURATION_MS = 8000;

// How long a detail page gets before its extraction is trusted, and how long before giving up
// on it entirely. Generous: LinkedIn's own detail pages can be slow to render.
const SECTION_SETTLE_MS = 1500;
const SECTION_TIMEOUT_MS = 15000;
const MAX_SECTION_ATTEMPTS = 2;
// The whole multi-page crawl never runs longer than this, whatever isn't done yet gets marked
// failed rather than the scan hanging forever on one bad page.
const OVERALL_SCAN_TIMEOUT_MS = 120000;

// LinkedIn's "Show all" links can render well after the main page otherwise looks settled —
// observed as slow as ~9s on a cold navigation. An empty discovery result gets retried on
// later ticks for this long before it's trusted, so a slow render doesn't permanently lock in
// a queue with nothing in it.
const DISCOVERY_SETTLE_MS = 20000;

declare global {
  interface Window {
    __linkwiseTeardown__?: () => void;
  }
}

window.__linkwiseTeardown__?.();
let torndown = false;
const cleanupFns: (() => void)[] = [];
function registerCleanup(fn: () => void): void {
  cleanupFns.push(fn);
}

function findScrollContainer(): Element {
  const candidates = [document.scrollingElement, document.querySelector("main")].filter(
    (el): el is Element => el != null,
  );
  for (const candidate of candidates) {
    if (candidate.scrollHeight - candidate.clientHeight > 40) return candidate;
  }
  return document.scrollingElement ?? document.documentElement;
}

function isNearDocumentEnd(): boolean {
  const el = findScrollContainer();
  return el.scrollTop + el.clientHeight >= el.scrollHeight - DOCUMENT_END_MARGIN_PX;
}

const autoScroll = createAutoScrollDriver({ now: () => Date.now(), maxDurationMs: AUTO_SCROLL_MAX_DURATION_MS });

function isNearDocumentEndOrTimedOut(): boolean {
  return isNearDocumentEnd() || autoScroll.hasTimedOut(engine.getProfileKey());
}

function hasEnoughEvidenceToSettle(profile: LinkedInProfile): boolean {
  return getScanModeState().mode === "scroll" && profile.extracted && foundSections(profile).length > 0;
}

const savedScrollPositions = new Map<string, number>();
const restoredProfileKeys = new Set<string>();
const autoScannedProfileKeys = new Set<string>();

function maybeRestoreScrollPosition(profileKey: string): void {
  if (restoredProfileKeys.has(profileKey)) return;
  restoredProfileKeys.add(profileKey);
  const savedTop = savedScrollPositions.get(profileKey);
  if (savedTop === undefined) return;
  const container = findScrollContainer();
  if (Math.abs(container.scrollTop - savedTop) < 2) return;
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
    setPanelProfileData({ profileKey, profile, collection, autoScanProgress: getPanelProfileData().autoScanProgress });
  },
  onReset: (profileKey) => {
    savedScrollPositions.set(profileKey, findScrollContainer().scrollTop);
    setPanelProfileData({ profileKey, profile: null, collection: null, autoScanProgress: null });
  },
  onLeaveProfile: () => {
    setPanelProfileData({ profileKey: null, profile: null, collection: null, autoScanProgress: null });
  },
});

function shouldExpandDetailsThisTick(mode: ScanMode): boolean {
  return mode === "auto" || getExpandDetailsState().enabled;
}

// --- Auto scan checklist state (separate from the single-page engine above, only ever driven
// while mode is "auto") ---
let autoScanSession: AutoScanSession | null = null;
let autoScanEvidence: LinkedInProfile = { ...EMPTY_PROFILE };
let autoScanLoadedForKey: string | null = null;
let autoScanLoadInFlight = false;
let sectionArrivedAt: number | null = null;
let sectionHandledUrl: string | null = null;
let discoveryFirstEmptyAt: number | null = null;

function publishAutoScanState(profileKey: string): void {
  if (!autoScanSession) return;
  const progress: AutoScanProgress = {
    sessionId: autoScanSession.sessionId,
    status: autoScanSession.status,
    currentIndex: autoScanSession.currentIndex,
    sections: autoScanSession.sections.map((s) => ({ heading: s.heading, url: s.url, status: s.status })),
  };
  setPanelProfileData({
    profileKey,
    profile: autoScanEvidence.extracted ? autoScanEvidence : getPanelProfileData().profile,
    collection: engine.getCollectionState(),
    autoScanProgress: progress,
  });
}

// Advances to whichever section comes next, or back to the original profile once the whole
// queue is done. Never re-opens a URL already marked done this session. If Enhanced analysis
// gets turned off mid-crawl, the section already open still finishes (see tickAutoScanCrawl),
// but this is the one place that decides whether to open another one — so turning it off here
// stops the crawl in place instead, keeping whatever evidence was already collected.
function goToNextSectionOrFinish(session: AutoScanSession): void {
  const finalSession = !isSessionComplete(session) && !getEnhancedAnalysisState().enabled ? forceCompleteSession(session) : session;
  if (finalSession !== session) {
    autoScanSession = finalSession;
    void saveAutoScanSession(finalSession);
    // The caller already published the pre-finalize state, so the panel needs telling again —
    // going home doesn't guarantee another crawl tick will, e.g. if the main page never re-settles.
    publishAutoScanState(finalSession.profileKey);
  }
  if (isSessionComplete(finalSession)) {
    if (normalizeProfileUrl(location.href) !== finalSession.originalProfileUrl) {
      location.assign(finalSession.originalProfileUrl);
    }
    return;
  }
  const next = nextPendingSection(finalSession);
  if (next) location.assign(next.url);
}

// One tick of the multi-page crawl. Only ever called for "auto" mode. Local code alone decides
// what happens next; OpenAI is never asked which page to visit.
function tickAutoScanCrawl(): void {
  const profileKey = profileIdentityKey(location.href);
  if (profileKey === null) return;

  if (autoScanLoadedForKey !== profileKey) {
    if (autoScanLoadInFlight) return;
    autoScanLoadInFlight = true;
    autoScanSession = null;
    autoScanEvidence = { ...EMPTY_PROFILE };
    discoveryFirstEmptyAt = null;
    Promise.all([loadAutoScanSession(profileKey), loadProfileEvidence(profileKey)]).then(([session, evidence]) => {
      autoScanSession = session;
      autoScanEvidence = evidence;
      autoScanLoadedForKey = profileKey;
      autoScanLoadInFlight = false;
      if (autoScanSession) publishAutoScanState(profileKey);
      if (!torndown) tick(); // continue acting on the now-known state, rather than waiting for the next scheduled tick
    });
    return;
  }

  const currentUrl = normalizeProfileUrl(location.href);
  if (!currentUrl) return;

  if (autoScanSession === null) {
    // Nothing started yet for this profile. Only ever begins from the main profile page, once
    // the single-page engine says the main page itself is fully covered. Discovery needs the
    // main page's own "Show all" links, so a stray direct visit to a details page (no session
    // recovered) redirects to the main profile instead of guessing at a queue.
    const mainProfileUrl = `https://www.linkedin.com/in/${profileKey}/`;
    if (currentUrl !== mainProfileUrl) {
      location.assign(mainProfileUrl);
      return;
    }
    if (!getEnhancedAnalysisState().enabled) return; // main-page-only scan, never starts the crawler
    const coverage = deriveScanCoverage(engine.getCollectionState());
    if (coverage !== "complete") return;

    const rawDiscovered = discoverProfileSections(document);
    if (rawDiscovered.length === 0) {
      // Nothing rendered yet at all, distinct from "found sections, but every one is excluded
      // by policy" below — only the former is worth waiting out a slow LinkedIn render for.
      if (discoveryFirstEmptyAt === null) discoveryFirstEmptyAt = Date.now();
      if (Date.now() - discoveryFirstEmptyAt < DISCOVERY_SETTLE_MS) return; // give lazy-rendered links more time
    }
    const discovered = excludeFromAutoScanQueue(rawDiscovered);

    autoScanEvidence = mergeProfileEvidence(autoScanEvidence, extractLinkedInProfile(document));
    const session = startAutoScanSession(profileKey, currentUrl, discovered);
    autoScanSession = session;
    void saveAutoScanSession(session);
    void saveProfileEvidence(profileKey, autoScanEvidence);
    publishAutoScanState(profileKey);
    goToNextSectionOrFinish(session);
    return;
  }

  if (isSessionComplete(autoScanSession)) {
    publishAutoScanState(profileKey);
    return;
  }

  if (hasExceededOverallTimeout(autoScanSession, OVERALL_SCAN_TIMEOUT_MS)) {
    autoScanSession = forceCompleteSession(autoScanSession);
    void saveAutoScanSession(autoScanSession);
    publishAutoScanState(profileKey);
    goToNextSectionOrFinish(autoScanSession);
    return;
  }

  const pending = nextPendingSection(autoScanSession);
  if (!pending) return;

  if (currentUrl !== pending.normalizedUrl) {
    // Also passes through the Enhanced-analysis check, so a recovered session with a
    // not-yet-visited pending section doesn't open it if the preference was turned off meanwhile.
    if (sectionHandledUrl !== pending.normalizedUrl) goToNextSectionOrFinish(autoScanSession);
    return;
  }

  if (sectionHandledUrl === pending.normalizedUrl) return;

  if (pending.status === "pending") {
    autoScanSession = markCurrentSectionScanning(autoScanSession);
    void saveAutoScanSession(autoScanSession);
    sectionArrivedAt = Date.now();
    publishAutoScanState(profileKey);
    return;
  }

  if (sectionArrivedAt === null) sectionArrivedAt = Date.now();
  const elapsed = Date.now() - sectionArrivedAt;
  const sectionProfile = extractLinkedInProfile(document);
  const settled = sectionProfile.extracted;

  if (!settled) {
    if (elapsed < SECTION_TIMEOUT_MS) return;
    sectionArrivedAt = null;
    const indexBeforeFailure = autoScanSession.currentIndex;
    void (async () => {
      autoScanSession = markCurrentSectionFailed(autoScanSession!, MAX_SECTION_ATTEMPTS);
      await saveAutoScanSession(autoScanSession);
      const verified = await loadAutoScanSession(profileKey);
      if (verified) autoScanSession = verified;
      publishAutoScanState(profileKey);
      const retrying = autoScanSession.currentIndex === indexBeforeFailure;
      if (retrying) return; // same section, try extracting again in place
      goToNextSectionOrFinish(autoScanSession);
    })();
    return;
  }

  if (elapsed < SECTION_SETTLE_MS) return;

  expandSeeMoreToggles(document, { restrictToViewport: false });
  const finalSectionProfile = extractLinkedInProfile(document);
  autoScanEvidence = mergeProfileEvidence(autoScanEvidence, finalSectionProfile);
  sectionHandledUrl = pending.normalizedUrl;

  void (async () => {
    await saveProfileEvidence(profileKey, autoScanEvidence);
    autoScanSession = markCurrentSectionDone(autoScanSession!);
    await saveAutoScanSession(autoScanSession);
    const verified = await loadAutoScanSession(profileKey);
    if (verified) autoScanSession = verified;
    sectionArrivedAt = null;
    publishAutoScanState(profileKey);
    goToNextSectionOrFinish(autoScanSession);
  })();
}

function tick(): void {
  if (torndown) return;
  ensureLinkWiseOpener(togglePanel);
  runJobsTick(location.href, getJobsSettingsState().settings);
  const mode = getScanModeState().mode;
  const isDetailsPage = /\/details\//.test(location.href);

  if (isDetailsPage && mode === "auto") {
    tickAutoScanCrawl();
    return;
  }

  if (shouldExpandDetailsThisTick(mode)) {
    expandSeeMoreToggles(document, { restrictToViewport: mode !== "auto" });
  }
  engine.tick();

  const profileKey = engine.getProfileKey();
  if (profileKey === null) return;

  const coverage = deriveScanCoverage(engine.getCollectionState());

  if (coverage === "complete") {
    if (autoScannedProfileKeys.has(profileKey)) maybeRestoreScrollPosition(profileKey);
    if (mode === "auto") tickAutoScanCrawl();
    return;
  }

  if (!shouldAttemptAutoScroll(mode, coverage)) return;

  const goalActive = selectActiveGoal(getGoalStoreState()) !== null;
  if (autoScroll.shouldScrollNow(mode, profileKey, goalActive, isNearDocumentEnd())) {
    autoScannedProfileKeys.add(profileKey);
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

  // Job cards render in a rapid burst of childList mutations as LinkedIn builds them out, and can
  // even get replaced outright. Reacting to those immediately (not on the general debounce) keeps
  // a hidden card from flashing visible for the debounce window.
  const isJobCardOrHasOne = (node: Node) =>
    node instanceof Element && (node.matches("[data-occludable-job-id]") || !!node.querySelector("[data-occludable-job-id]"));

  const observer = new MutationObserver((records) => {
    const touchesJobCard = records.some(
      (r) =>
        (r.target as Element).closest?.("[data-occludable-job-id]") ||
        Array.from(r.addedNodes).some(isJobCardOrHasOne) ||
        Array.from(r.removedNodes).some(isJobCardOrHasOne),
    );
    if (touchesJobCard) runJobsTick(location.href, getJobsSettingsState().settings);
    scheduleTick();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  registerCleanup(() => observer.disconnect());

  window.addEventListener("scroll", scheduleTick, { passive: true });
  registerCleanup(() => window.removeEventListener("scroll", scheduleTick));
  document.addEventListener("scroll", scheduleTick, { passive: true, capture: true });
  registerCleanup(() => document.removeEventListener("scroll", scheduleTick, true));

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

initGoalStore();
registerCleanup(subscribeGoalStore(tick));

initScanModeStore();
registerCleanup(subscribeScanModeStore(tick));

initExpandDetailsStore();
registerCleanup(subscribeExpandDetailsStore(tick));

initEnhancedAnalysisStore();
registerCleanup(subscribeEnhancedAnalysisStore(tick));

initJobsSettingsStore();
registerCleanup(subscribeJobsSettingsStore(tick));

tick();
watchForChanges();
registerCleanup(installDevTooling(() => getPanelProfileData()));

window.__linkwiseTeardown__ = () => {
  torndown = true;
  cleanupFns.forEach((fn) => fn());
  removeLinkWiseOpener();
  destroyPanel();
};
