// Describes how much of a profile has been read, separate from the content itself, so the UI
// knows whether collection has settled before presenting a score as final.
import type { ProfileSectionName } from "./profile";

export type CollectionStatus = "collecting" | "settled";

export interface CollectionState {
  status: CollectionStatus;
  /** Sections whose content has actually been captured, not a required checklist. */
  sectionsFound: ProfileSectionName[];
  /** Sections known to exist so far, always a superset of sectionsFound. Can grow as the user
   * scrolls, never shrinks back to a fixed total. */
  sectionsDetected: ProfileSectionName[];
  /** Epoch ms of the last real change, used to judge stability, not a fixed page-load timer. */
  lastChangedAt: number;
  /** True once scrolled at or near the bottom. Required alongside the quiet period for settled. */
  reachedDocumentEnd: boolean;
}

export function initialCollectionState(now: number): CollectionState {
  return {
    status: "collecting",
    sectionsFound: [],
    sectionsDetected: [],
    lastChangedAt: now,
    reachedDocumentEnd: false,
  };
}
