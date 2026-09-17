// Coordinates invisible background-tab profile scanning. A LinkedIn profile the user has open
// must never visibly scroll or jump (see linkedin/content.ts's own doc comment on this) — so the
// actual scroll-to-load-lazy-sections work happens instead in a separate, inactive tab this
// module creates on request, pointed at the same profile. That tab's own content script (see
// content.ts's scan-mode boot path) collects evidence there and reports it back here via
// chrome.runtime messaging; this module relays it on to whichever visible tab asked for it, and
// closes the scan tab once collection settles (or the job fails). The user's own tab — its
// opener, its panel, and above all its scroll position — is never touched by any of this.
//
// Known limitation, confirmed live: Chrome gives an `active: false` background tab reduced
// rendering priority, and LinkedIn's own client app appears to defer some lazy-loaded content
// while the page isn't the visible tab — so a scan tab can end up with less depth than the same
// profile would show in a foreground tab. There is no available, constraint-compliant way
// around this (a fully or mostly off-screen window is rejected outright by Chrome's own window-
// bounds validation, and forcing LinkedIn to believe the tab is visible when it is not is a
// detection-evasion technique this project does not use). The collection engine's own settle
// timeout (see collectionEngine.ts/autoScroll.ts) already means this degrades to "analyze with
// whatever loaded" rather than ever hanging — see content.ts's doc comment for the full tradeoff.
import {
  buildScanUrl,
  isScanTabUrl,
  SCAN_CANCEL,
  SCAN_FAILED,
  SCAN_REPORT,
  SCAN_REQUEST,
  SCAN_UPDATE,
  type ScanCancelMessage,
  type ScanFailedMessage,
  type ScanReportMessage,
  type ScanRequestMessage,
  type ScanUpdateMessage,
} from "../linkedin/backgroundScanProtocol";

/** Generous upper bound on one full scan job, measured from the moment the tab is created —
 * comfortably above the scan tab's own auto-scroll timeout (8s, see autoScroll.ts) plus its
 * settle quiet period (2.5s, see collectionEngine.ts) plus ordinary page-load time, so this only
 * ever fires for a genuinely stuck job (a LinkedIn checkpoint/login interstitial, a crashed tab,
 * a lost service-worker restart) — never a normal-but-slow one. */
const SCAN_JOB_TIMEOUT_MS = 15000;

interface ScanJob {
  tabId: number;
  profileKey: string;
  requestingTabIds: Set<number>;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const jobsByProfileKey = new Map<string, ScanJob>();

function findJobByTabId(tabId: number): ScanJob | undefined {
  for (const job of jobsByProfileKey.values()) {
    if (job.tabId === tabId) return job;
  }
  return undefined;
}

function notifyRequesters(job: ScanJob, message: unknown): void {
  for (const tabId of job.requestingTabIds) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // The requesting tab may have closed, or navigated away leaving an orphaned content-script
      // instance behind (see ai/backgroundRelay.ts's doc comment for the same failure mode) —
      // nothing useful to do about a lost relay.
    });
  }
}

function closeJob(profileKey: string): void {
  const job = jobsByProfileKey.get(profileKey);
  if (!job) return;
  clearTimeout(job.timeoutHandle);
  jobsByProfileKey.delete(profileKey);
  chrome.tabs.remove(job.tabId).catch(() => {
    // Already closed (by chrome.tabs.onRemoved's own handler, or by the user) — nothing to do.
  });
}

function failJob(profileKey: string): void {
  const job = jobsByProfileKey.get(profileKey);
  if (!job) return;
  const message: ScanFailedMessage = { type: SCAN_FAILED, profileKey };
  notifyRequesters(job, message);
  closeJob(profileKey);
}

function handleScanRequest(message: ScanRequestMessage, requestingTabId: number): void {
  const existing = jobsByProfileKey.get(message.profileKey);
  if (existing) {
    existing.requestingTabIds.add(requestingTabId);
    return;
  }

  chrome.tabs
    .create({ url: buildScanUrl(message.profileKey), active: false })
    .then((tab) => {
      if (tab.id == null) return;
      const timeoutHandle = setTimeout(() => failJob(message.profileKey), SCAN_JOB_TIMEOUT_MS);
      jobsByProfileKey.set(message.profileKey, {
        tabId: tab.id,
        profileKey: message.profileKey,
        requestingTabIds: new Set([requestingTabId]),
        timeoutHandle,
      });
    })
    .catch(() => {
      // Tab creation itself failed (rare) — nothing to relay back except a plain failure.
      const failedMessage: ScanFailedMessage = { type: SCAN_FAILED, profileKey: message.profileKey };
      chrome.tabs.sendMessage(requestingTabId, failedMessage).catch(() => {});
    });
}

function handleScanReport(message: ScanReportMessage, scanTabId: number): void {
  const job = findJobByTabId(scanTabId);
  if (!job) return; // stale/unknown tab — its job was already closed (timeout, cancel, or done)

  const update: ScanUpdateMessage = {
    type: SCAN_UPDATE,
    profileKey: message.profileKey,
    profile: message.profile,
    collection: message.collection,
  };
  notifyRequesters(job, update);
  if (message.collection.status === "settled") closeJob(job.profileKey);
}

function handleScanCancel(message: ScanCancelMessage): void {
  closeJob(message.profileKey);
}

export function installBackgroundScan(): void {
  chrome.runtime.onMessage.addListener((message: { type?: unknown }, sender) => {
    if (message?.type === SCAN_REQUEST && sender.tab?.id != null) {
      handleScanRequest(message as ScanRequestMessage, sender.tab.id);
      return false;
    }
    if (message?.type === SCAN_REPORT && sender.tab?.id != null) {
      handleScanReport(message as ScanReportMessage, sender.tab.id);
      return false;
    }
    if (message?.type === SCAN_CANCEL) {
      handleScanCancel(message as ScanCancelMessage);
      return false;
    }
    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    const job = findJobByTabId(tabId);
    if (!job) return;
    // The tab is already gone — don't try to remove it again, just tell whoever's waiting so
    // they fall back to whatever evidence they already have instead of hanging.
    clearTimeout(job.timeoutHandle);
    jobsByProfileKey.delete(job.profileKey);
    const failedMessage: ScanFailedMessage = { type: SCAN_FAILED, profileKey: job.profileKey };
    notifyRequesters(job, failedMessage);
  });

  // A genuine extension reload/update wipes this module's in-memory job map, which would
  // otherwise orphan any scan tab a previous lifetime had open — sweep them here. Deliberately
  // wired to onInstalled only, never an ordinary service-worker wake, for the exact same reason
  // background/index.ts's own dev-reinjection logic is onInstalled-gated: an idle-then-woken
  // restart must not assume every scan tab it finds is orphaned, since a real job may still be
  // legitimately in flight (the empty in-memory map on a fresh restart would otherwise look
  // identical to a genuine reload from in here). A genuine reload, by contrast, really does lose
  // every in-flight job for good, so any `lwscan` tab still open at that moment is definitely
  // orphaned.
  chrome.runtime.onInstalled.addListener(() => {
    void chrome.tabs.query({ url: "https://*.linkedin.com/*" }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id != null && tab.url && isScanTabUrl(tab.url)) {
          chrome.tabs.remove(tab.id).catch(() => {});
        }
      }
    });
  });
}
