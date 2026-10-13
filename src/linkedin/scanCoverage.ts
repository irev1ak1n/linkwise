// Pure decision logic for scan-mode transitions, kept separate from content.ts's DOM wiring
// so it's fully unit-testable. A score existing is not the same as the profile being fully
// covered, this file is what tells those two apart.
import type { CollectionState } from "../models/collection";
import type { ScanMode } from "../models/scanMode";

export type ScanCoverage = "untouched" | "partial" | "complete";

/** "complete" means collection settled AND the real document end was actually reached, whether
 * by the user manually scrolling there or by an auto scan. A profile that settled early (see
 * collectionEngine.ts's hasEnoughEvidence, used in "scroll" mode) still only counts as
 * "partial", even though it may already have a real Match % showing. */
export function deriveScanCoverage(collection: CollectionState | null): ScanCoverage {
  if (!collection || collection.sectionsFound.length === 0) return "untouched";
  if (collection.status === "settled" && collection.reachedDocumentEnd) return "complete";
  return "partial";
}

/** The one strict condition before any auto-scroll starts. "scroll" mode must never scroll the
 * page no matter what else is true, and a fully-covered profile has nothing left to gain from
 * scrolling further. */
export function shouldAttemptAutoScroll(mode: ScanMode, coverage: ScanCoverage): boolean {
  return mode === "auto" && coverage !== "complete";
}
