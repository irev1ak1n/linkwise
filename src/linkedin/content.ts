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
import { detailsPageSection, detectProfileSections, extractDetailsPageProfile, extractLinkedInProfile, normalizeProfileUrl, profileIdentityKey } from "./profileAdapter";
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
import { loadProfileSession, updateProfileSession } from "../storage/profileSessionRepository";
import { ensureLinkWiseOpener, removeLinkWiseOpener } from "./opener";
import { getPanelProfileData, setPanelProfileData, type AutoScanProgress } from "./panel/panelStore";
import { destroyPanel, openPanel, togglePanel, wasPanelOpen } from "./panel/mount";
import { installDevTooling } from "./devTools";
import { createAutoScrollDriver } from "./autoScroll";
import { getGoalStoreState, initGoalStore, selectActiveGoal, subscribeGoalStore } from "./panel/goalStore";
import { getScanModeState, initScanModeStore, subscribeScanModeStore, type ScanMode } from "./panel/scanModeStore";
import { getExpandDetailsState, initExpandDetailsStore, subscribeExpandDetailsStore } from "./panel/expandDetailsStore";
import { getEnhancedAnalysisState, initEnhancedAnalysisStore, subscribeEnhancedAnalysisStore } from "./panel/enhancedAnalysisStore";
import { getManualSectionsState, initManualSectionsStore } from "./panel/manualSectionsStore";
import { autoExpandPreference } from "./panel/autoExpandPreference";
import { SECTION_SCROLL_STEP_PX, nextSectionScanStep, startSectionScan, type SectionScanState } from "./sectionScan";
import { hydrateAnalysisCache } from "../ai/aiAnalysisCache";
import { hydrateSignalCache } from "../ai/signalAnalysisController";
import { expandSeeMoreToggles } from "./expandContent";
import { getJobsSettingsState, initJobsSettingsStore, subscribeJobsSettingsStore } from "./panel/jobsSettingsStore";
import { runJobsTick } from "./jobs/jobsRuntime";
import { JOB_CARD_SELECTOR } from "./jobs/jobCardDetector";
import { claimRuntime } from "./runtimeTakeover";
import { createSignalRuntime, signalTickInput } from "./signalRuntime";
import { SignalHighlighter } from "./signalHighlighter";
import { getSignalModeState, initSignalModeStore, publishSignalAnalysis, subscribeSignalModeStore } from "./panel/signalModeStore";
import { watchForContextInvalidation } from "./extensionContext";

const DOCUMENT_END_MARGIN_PX = 600;
const MUTATION_DEBOUNCE_MS = 900;
const TICK_INTERVAL_MS = 2500;
const SETTLED_TICK_INTERVAL_MS = 6000;
const AUTO_SCROLL_MAX_DURATION_MS = 8000;

// How long a detail page gets before its extraction is trusted, and how long before giving up
// on it entirely. Generous: LinkedIn's own detail pages can be slow to render.
const SECTION_SETTLE_MS = 1500;
const SECTION_STEP_MS = 700;
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

let torndown = false;
const cleanupFns: (() => void)[] = [];
function registerCleanup(fn: () => void): void {
  cleanupFns.push(fn);
}

// A dead instance's opener would otherwise be reused by the next one, still wired to its panel.
function teardown(): void {
  if (torndown) return;
  torndown = true;
  cleanupFns.forEach((fn) => fn());
  removeLinkWiseOpener();
  destroyPanel();
}

registerCleanup(claimRuntime(teardown));
registerCleanup(watchForContextInvalidation(teardown));

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

// A page that can't scroll yet hasn't rendered its sections, so it isn't at its end.
function isPageScrollable(): boolean {
  const el = findScrollContainer();
  return el.scrollHeight - el.clientHeight > 40;
}

function isNearDocumentEndOrTimedOut(): boolean {
  return isPageScrollable() && (isNearDocumentEnd() || autoScroll.hasTimedOut(engine.getProfileKey()));
}

function hasEnoughEvidenceToSettle(profile: LinkedInProfile): boolean {
  if (restoredSession && profile.extracted) return true;
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
    const merged = withAccumulatedEvidence(profileKey, profile);
    const settled = collection.status === "settled" || (restoredSession && sessionKey === profileKey);
    if (settled && merged.extracted) {
      autoScanEvidence = merged;
      void persistSession(profileKey, { evidence: merged });
    }
    setPanelProfileData({
      profileKey,
      profile: merged,
      collection: settled ? { ...collection, status: "settled" } : collection,
      autoScanProgress: getPanelProfileData().autoScanProgress,
    });
  },
  onReset: (profileKey) => {
    savedScrollPositions.set(profileKey, findScrollContainer().scrollTop);
    const current = getPanelProfileData();
    if (current.profileKey === profileKey) return; // same person arriving from one of their detail pages
    setPanelProfileData({ profileKey, profile: null, collection: null, autoScanProgress: null });
  },
  onLeaveProfile: () => {
    setPanelProfileData({ profileKey: null, profile: null, collection: null, autoScanProgress: null });
  },
});

function shouldExpandDetailsThisTick(mode: ScanMode): boolean {
  return mode === "auto" ? autoExpandPreference.getState().enabled : getExpandDetailsState().enabled;
}

// --- Auto scan checklist state (separate from the single-page engine above, only ever driven
// while mode is "auto") ---
let autoScanSession: AutoScanSession | null = null;
let autoScanEvidence: LinkedInProfile = { ...EMPTY_PROFILE };
let autoScanLoadedForKey: string | null = null;

// One session per person, shared by their main page, detail pages and reloads for 10 minutes.
let sessionKey: string | null = null;
let sessionReady = false;
let restoredSession = false;
let sessionStartedAt: number | null = null;

// Writes keep the session's original start, so evidence carried in memory never outlives it.
async function persistSession(profileKey: string, update: { evidence: LinkedInProfile; scannedSection?: string | null }): Promise<void> {
  const session = await updateProfileSession(profileKey, { ...update, startedAt: sessionKey === profileKey ? sessionStartedAt : null });
  if (session && sessionKey === profileKey) sessionStartedAt ??= session.createdAt;
}

function ensureProfileSession(profileKey: string): boolean {
  if (sessionKey === profileKey) return sessionReady;
  sessionKey = profileKey;
  sessionReady = false;
  restoredSession = false;
  sessionStartedAt = null;
  autoScanEvidence = { ...EMPTY_PROFILE };
  void loadProfileSession(profileKey).then((session) => {
    if (sessionKey !== profileKey || torndown) return;
    sessionReady = true;
    sessionStartedAt = session?.createdAt ?? null;
    if (session?.evidence.extracted) {
      autoScanEvidence = session.evidence;
      restoredSession = true;
      const current = getPanelProfileData();
      setPanelProfileData({
        profileKey,
        profile: current.profileKey === profileKey && current.profile ? mergeProfileEvidence(current.profile, session.evidence) : session.evidence,
        collection: { ...engine.getCollectionState(), status: "settled" },
        autoScanProgress: current.profileKey === profileKey ? (current.autoScanProgress ?? null) : null,
      });
    }
    tick();
  });
  return false;
}
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

function withAccumulatedEvidence(profileKey: string, profile: LinkedInProfile): LinkedInProfile {
  return sessionKey === profileKey && autoScanEvidence.extracted ? mergeProfileEvidence(profile, autoScanEvidence) : profile;
}

let manualScan: SectionScanState | null = null;
let sectionStepHandle: ReturnType<typeof setTimeout> | null = null;
registerCleanup(() => {
  if (sectionStepHandle) clearTimeout(sectionStepHandle);
});

function scheduleSectionStep(): void {
  if (sectionStepHandle) return;
  sectionStepHandle = setTimeout(() => {
    sectionStepHandle = null;
    tick();
  }, SECTION_STEP_MS);
}

function tickManualSection(profileKey: string, currentUrl: string): void {
  const preference = getManualSectionsState();
  if (!preference.loaded || !preference.enabled || !/\/details\//.test(currentUrl)) return;
  const container = findScrollContainer();
  if (manualScan?.url !== currentUrl) {
    manualScan = startSectionScan(currentUrl, Date.now(), container.scrollTop);
    scheduleSectionStep();
    return;
  }

  const step = nextSectionScanStep(manualScan, Date.now(), SECTION_SETTLE_MS, container);
  if (step !== "extract") scheduleSectionStep();
  if (step === "wait") return;
  if (autoExpandPreference.getState().enabled) expandSeeMoreToggles(document, { restrictToViewport: false });
  if (step === "scroll") {
    manualScan.steps++;
    container.scrollBy({ top: SECTION_SCROLL_STEP_PX, behavior: "smooth" });
    return;
  }
  if (step === "finish-scroll") {
    manualScan.scrolled = true;
    if (manualScan.steps > 0) container.scrollTo({ top: manualScan.startTop, behavior: "smooth" });
    return;
  }

  const sectionProfile = extractDetailsPageProfile(document);
  if (!sectionProfile.extracted) return;
  const current = getPanelProfileData();
  const base = autoScanEvidence.extracted
    ? autoScanEvidence
    : current.profileKey === profileKey && current.profile
      ? current.profile
      : { ...EMPTY_PROFILE };
  const merged = mergeProfileEvidence(base, sectionProfile);
  if (JSON.stringify(merged) === JSON.stringify(base)) return;

  autoScanEvidence = merged;
  void persistSession(profileKey, { evidence: merged, scannedSection: detailsPageSection(currentUrl) });
  setPanelProfileData({
    profileKey,
    profile: merged,
    collection: { ...engine.getCollectionState(), status: "settled" },
    autoScanProgress: current.profileKey === profileKey ? (current.autoScanProgress ?? null) : null,
    updatingSection: detailsPageSection(currentUrl),
  });
}

function isCrawlerPage(currentUrl: string): boolean {
  if (!autoScanSession || isSessionComplete(autoScanSession)) return false;
  return nextPendingSection(autoScanSession)?.normalizedUrl === currentUrl;
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
    discoveryFirstEmptyAt = null;
    loadAutoScanSession(profileKey).then((session) => {
      autoScanSession = session;
      autoScanLoadedForKey = profileKey;
      autoScanLoadInFlight = false;
      if (autoScanSession) publishAutoScanState(profileKey);
      if (!torndown) tick(); // continue acting on the now-known state, rather than waiting for the next scheduled tick
    });
    return;
  }

  const currentUrl = normalizeProfileUrl(location.href);
  if (!currentUrl) return;
  const mainProfileUrl = `https://www.linkedin.com/in/${profileKey}/`;

  // Only a page the crawler itself opened (the active session's pending section) is crawler-owned.
  // Anything else the user opened is left alone: no redirect, no new session.
  if (currentUrl !== mainProfileUrl && !isCrawlerPage(currentUrl)) {
    tickManualSection(profileKey, currentUrl);
    return;
  }

  if (autoScanSession === null) {
    // Discovery needs the main page's own "Show all" links, so a crawl only ever starts there.
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
    void persistSession(profileKey, { evidence: autoScanEvidence });
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
  const sectionProfile = extractDetailsPageProfile(document);
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
  const finalSectionProfile = extractDetailsPageProfile(document);
  autoScanEvidence = mergeProfileEvidence(autoScanEvidence, finalSectionProfile);
  sectionHandledUrl = pending.normalizedUrl;

  void (async () => {
    await persistSession(profileKey, { evidence: autoScanEvidence });
    autoScanSession = markCurrentSectionDone(autoScanSession!);
    await saveAutoScanSession(autoScanSession);
    const verified = await loadAutoScanSession(profileKey);
    if (verified) autoScanSession = verified;
    sectionArrivedAt = null;
    publishAutoScanState(profileKey);
    goToNextSectionOrFinish(autoScanSession);
  })();
}

const signalRuntime = createSignalRuntime({ highlighter: new SignalHighlighter(document), publish: publishSignalAnalysis });
registerCleanup(() => signalRuntime.dispose());

let signalHref = "";
function tickSignals(): void {
  signalHref = location.href;
  signalRuntime.tick(signalTickInput(getSignalModeState().enabled, location.href, getPanelProfileData()));
}

function tick(): void {
  if (torndown) return;
  ensureLinkWiseOpener(togglePanel);
  runJobsTick(location.href, getJobsSettingsState().settings);
  tickSignals();
  if (!getScanModeState().loaded) return;
  const urlProfileKey = profileIdentityKey(location.href);
  if (urlProfileKey !== null && !ensureProfileSession(urlProfileKey)) return;
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

  if (!shouldAttemptAutoScroll(mode, coverage) || restoredSession || !isPageScrollable()) return;

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
    node instanceof Element && (node.matches(JOB_CARD_SELECTOR) || !!node.querySelector(JOB_CARD_SELECTOR));

  const observer = new MutationObserver((records) => {
    const touchesJobCard = records.some(
      (r) =>
        (r.target as Element).closest?.(JOB_CARD_SELECTOR) ||
        Array.from(r.addedNodes).some(isJobCardOrHasOne) ||
        Array.from(r.removedNodes).some(isJobCardOrHasOne),
    );
    if (touchesJobCard) runJobsTick(location.href, getJobsSettingsState().settings);
    if (location.href !== signalHref) tickSignals();
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

void hydrateAnalysisCache();
void hydrateSignalCache();
initManualSectionsStore();
autoExpandPreference.init();
initEnhancedAnalysisStore();
registerCleanup(subscribeEnhancedAnalysisStore(tick));

initJobsSettingsStore();
registerCleanup(subscribeJobsSettingsStore(tick));

initSignalModeStore();
let signalModeEnabled = getSignalModeState().enabled;
registerCleanup(
  subscribeSignalModeStore(() => {
    if (getSignalModeState().enabled === signalModeEnabled) return;
    signalModeEnabled = getSignalModeState().enabled;
    if (!torndown) tickSignals();
  }),
);

tick();
if (wasPanelOpen()) openPanel();
watchForChanges();
registerCleanup(installDevTooling(() => getPanelProfileData()));
