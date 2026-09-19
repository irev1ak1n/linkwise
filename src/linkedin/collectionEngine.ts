// The state machine behind scroll-based collection, separate from the DOM adapter and
// content.ts. Every side effect is injected, so this is testable with no jsdom or timers.
import { foundSections } from "../models/profile";
import type { LinkedInProfile, ProfileSectionName } from "../models/profile";
import { initialCollectionState, type CollectionState } from "../models/collection";

// How long to wait with no change before considering a profile settled. Resets on every
// real change, so a slow-loading profile never gets cut off early.
const QUIET_PERIOD_MS = 2500;

export interface CollectionEngineDeps {
  now: () => number;
  extractProfile: () => LinkedInProfile;
  /** Which section headings currently exist, whether or not their content is captured yet. */
  detectSections: () => ProfileSectionName[];
  getProfileKey: () => string | null;
  /** True once scrolled at or near the bottom. Combined with the quiet period, so settled
   * means both nothing new is appearing and there was a real chance to see more. */
  isNearDocumentEnd: () => boolean;
  /** An alternate way to settle without reaching the document end, e.g. "analyze as I scroll"
   * mode settling once useful evidence exists rather than waiting for the real bottom. Still
   * combined with the quiet period. Omit to require isNearDocumentEnd only, as before. */
  hasEnoughEvidence?: (profile: LinkedInProfile) => boolean;
  onUpdate: (profileKey: string, profile: LinkedInProfile, collection: CollectionState) => void;
  onReset: (profileKey: string) => void;
  /** Called once when navigating away from a profile page, so the UI can clear stale evidence
   * instead of showing it as if it still applied. */
  onLeaveProfile: () => void;
}

export interface CollectionEngine {
  /** Re-reads the page and advances the state machine. Cheap and idempotent. */
  tick: () => void;
  getCollectionState: () => CollectionState;
  getProfileKey: () => string | null;
}

function sameProfile(a: LinkedInProfile, b: LinkedInProfile): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameSections(a: ProfileSectionName[], b: ProfileSectionName[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createCollectionEngine(deps: CollectionEngineDeps): CollectionEngine {
  let profileKey: string | null = null;
  let lastProfile: LinkedInProfile | null = null;
  let collection: CollectionState = initialCollectionState(deps.now());

  function resetFor(newKey: string): void {
    profileKey = newKey;
    lastProfile = null;
    collection = initialCollectionState(deps.now());
    deps.onReset(newKey);
  }

  function tick(): void {
    const currentKey = deps.getProfileKey();
    if (currentKey === null) {
      if (profileKey !== null) {
        // Just navigated away from a profile, clear the stale evidence.
        profileKey = null;
        lastProfile = null;
        collection = initialCollectionState(deps.now());
        deps.onLeaveProfile();
      }
      return;
    }
    if (currentKey !== profileKey) {
      resetFor(currentKey);
    }

    const profile = deps.extractProfile();
    const now = deps.now();
    let changed = false;

    const profileChanged = !lastProfile || !sameProfile(lastProfile, profile);
    if (profileChanged) lastProfile = profile;

    // A section can be detected before it's found, so sectionsDetected is always at least
    // sectionsFound.
    const sectionsFound = foundSections(profile);
    const sectionsDetected = Array.from(new Set([...deps.detectSections(), ...sectionsFound])) as ProfileSectionName[];
    const sectionsChanged =
      !sameSections(collection.sectionsFound, sectionsFound) ||
      !sameSections(collection.sectionsDetected, sectionsDetected);

    if (profileChanged || sectionsChanged) {
      collection = {
        ...collection,
        sectionsFound,
        sectionsDetected,
        lastChangedAt: now,
        status: "collecting", // real forward progress means we're still collecting
      };
      changed = true;
    }

    const reachedEnd = collection.reachedDocumentEnd || deps.isNearDocumentEnd();
    if (reachedEnd !== collection.reachedDocumentEnd) {
      collection = { ...collection, reachedDocumentEnd: reachedEnd };
      changed = true;
    }

    const quiet = now - collection.lastChangedAt >= QUIET_PERIOD_MS;
    const enoughEvidence = deps.hasEnoughEvidence?.(profile) ?? false;
    const shouldBeSettled = quiet && (collection.reachedDocumentEnd || enoughEvidence);
    if (shouldBeSettled && collection.status !== "settled") {
      collection = { ...collection, status: "settled" };
      changed = true;
    }

    if (changed && profileKey) {
      deps.onUpdate(profileKey, profile, collection);
    }
  }

  return {
    tick,
    getCollectionState: () => collection,
    getProfileKey: () => profileKey,
  };
}
