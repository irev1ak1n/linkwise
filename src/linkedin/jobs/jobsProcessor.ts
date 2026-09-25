import type { JobsSettings } from "../../models/jobsSettings";
import { findJobCards, isJobCardRendered } from "./jobCardDetector";
import { isJobCardApplied, isJobCardSaved, isJobCardViewed } from "./jobStateDetector";
import { extractCardText, matchedKeyword, parseKeywords } from "./keywordMatcher";
import { decideCardAction } from "./jobFilterEngine";
import { applyCardAction, ensureJobStylesInjected, getCardCurrentAction, restoreCard } from "./jobCardStyler";
import { getTrackedState, setTrackedState } from "./jobCardStateTracker";

export function processJobCards(root: ParentNode, settings: JobsSettings): void {
  ensureJobStylesInjected(document);
  const keywords = parseKeywords(settings.keywordsText);

  for (const { element, jobId } of findJobCards(root)) {
    const domCurrent = getCardCurrentAction(element);

    if (!isJobCardRendered(element)) {
      const known = jobId ? getTrackedState(jobId) : "none";
      if (known !== "none" && domCurrent !== known) applyCardAction(element, known);
      continue;
    }

    const applied = isJobCardApplied(element);
    const viewed = isJobCardViewed(element);
    const saved = isJobCardSaved(element);
    const keyword = keywords.length > 0 ? matchedKeyword(extractCardText(element), keywords, settings.caseInsensitive) : null;
    const desired = decideCardAction({ applied, viewed, saved, matchedKeyword: keyword }, settings);

    // TEMP DEBUG
    if (localStorage.getItem("lw_debug") === "1") {
      // eslint-disable-next-line no-console
      console.log("[LWJOBS]", JSON.stringify({ jobId, applied, viewed, saved, keyword, domCurrent, desired, t: Date.now() }));
    }

    if (domCurrent !== desired) applyCardAction(element, desired);
    if (jobId) setTrackedState(jobId, desired);
  }
}

export function restoreAllJobCards(root: ParentNode): void {
  for (const { element } of findJobCards(root)) restoreCard(element);
}
