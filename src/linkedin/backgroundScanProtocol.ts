// Shared wire protocol between a visible tab's content script (the requester) and the
// background service worker's scan coordinator (background/backgroundScan.ts) — imported by
// both bundle entry points (content/linkedin.js and background/index.js) so the message shapes
// and the scan-tab URL marker can never drift between the two sides. See content.ts's top-level
// doc comment for the full architecture this protocol supports: a LinkedIn profile the user has
// open must never visibly scroll, so the actual scroll-to-load-lazy-sections work happens in a
// separate, inactive tab instead — this file is the contract for that handoff.
import type { CollectionState } from "../models/collection";
import type { LinkedInProfile } from "../models/profile";

/** Visible tab -> background: "please scan this profile in a background tab; I'll wait for
 * SCAN_UPDATE/SCAN_FAILED." Deduplicated in the background by `profileKey` — a second request
 * for a profile already being scanned just joins the existing job rather than opening another
 * tab. */
export const SCAN_REQUEST = "LINKWISE_SCAN_REQUEST";
/** Visible tab -> background: "I no longer care about this profile's scan" (the user navigated
 * away before it finished) — lets the background close the now-pointless tab immediately
 * instead of waiting for it to settle or time out on its own. */
export const SCAN_CANCEL = "LINKWISE_SCAN_CANCEL";
/** Background-created scan tab -> background: "here's what I've extracted so far," sent once
 * per meaningful change and once more when collection settles. */
export const SCAN_REPORT = "LINKWISE_SCAN_REPORT";
/** Background -> visible tab: relays a scan tab's SCAN_REPORT to whichever tab(s) asked for it. */
export const SCAN_UPDATE = "LINKWISE_SCAN_UPDATE";
/** Background -> visible tab: the scan could not be completed (timed out, the tab was closed
 * unexpectedly, or it couldn't even be created) — the requester should fall back to whatever
 * evidence it already has (possibly none) rather than waiting forever. */
export const SCAN_FAILED = "LINKWISE_SCAN_FAILED";

export interface ScanRequestMessage {
  type: typeof SCAN_REQUEST;
  profileKey: string;
}
export interface ScanCancelMessage {
  type: typeof SCAN_CANCEL;
  profileKey: string;
}
export interface ScanReportMessage {
  type: typeof SCAN_REPORT;
  profileKey: string;
  profile: LinkedInProfile;
  collection: CollectionState;
}
export interface ScanUpdateMessage {
  type: typeof SCAN_UPDATE;
  profileKey: string;
  profile: LinkedInProfile;
  collection: CollectionState;
}
export interface ScanFailedMessage {
  type: typeof SCAN_FAILED;
  profileKey: string;
}

/** The query param that marks a tab as a LinkWise-created background scanner rather than a
 * normal user-opened profile view — read synchronously from `location.href` at content.ts's
 * very first line, before anything else runs, so a scan tab can never mistake itself for a
 * normal one. This is structural, not just cosmetic: a scan tab that ran the normal boot path
 * would see the same active goal as the real visible tab and request its OWN background scan,
 * recursively spawning more scan tabs — the URL marker is what a scan tab checks first to take
 * the entirely separate, scan-only code path that never makes that request. */
const SCAN_PARAM = "lwscan";

/** The one and only URL a scan tab is ever created with — always the plain canonical profile
 * URL (see profileAdapter.ts's `profileIdentityKey`, the inverse of this), never whatever
 * tracking query params happened to be on the visible tab's current URL, so the scan tab's own
 * load is never affected by anything unrelated to the profile itself. */
export function buildScanUrl(profileKey: string): string {
  const url = new URL(`https://www.linkedin.com/in/${encodeURIComponent(profileKey)}/`);
  url.searchParams.set(SCAN_PARAM, "1");
  return url.toString();
}

export function isScanTabUrl(href: string): boolean {
  try {
    return new URL(href).searchParams.get(SCAN_PARAM) === "1";
  } catch {
    return false;
  }
}
