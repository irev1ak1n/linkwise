import type { JobsSettings } from "../../models/jobsSettings";
import { findJobCards, isJobCardRendered } from "./jobCardDetector";
import { isJobCardApplied, isJobCardSaved, isJobCardViewed } from "./jobStateDetector";
import { extractCardText, matchedKeyword, parseKeywords } from "./keywordMatcher";
import { decideCardAction, highlightColorFor } from "./jobFilterEngine";
import { applyCardAction, ensureJobStylesInjected, getCardCurrentAction, getCardHighlightColor, restoreCard } from "./jobCardStyler";
import { getTrackedColor, getTrackedState, setTrackedState } from "./jobCardStateTracker";

export function processJobCards(root: ParentNode, settings: JobsSettings): void {
  ensureJobStylesInjected(document);
  const keywords = parseKeywords(settings.keywordsText);

  for (const { element, jobId } of findJobCards(root)) {
    const domCurrent = getCardCurrentAction(element);

    if (!isJobCardRendered(element)) {
      const known = jobId ? getTrackedState(jobId) : "none";
      const knownColor = jobId ? getTrackedColor(jobId) : null;
      const colorChanged = known === "highlight" && getCardHighlightColor(element) !== knownColor;
      if (known !== "none" && (domCurrent !== known || colorChanged)) applyCardAction(element, known, knownColor ?? undefined);
      continue;
    }

    const applied = isJobCardApplied(element);
    const viewed = isJobCardViewed(element);
    const saved = isJobCardSaved(element);
    const keyword = keywords.length > 0 ? matchedKeyword(extractCardText(element), keywords, settings.caseInsensitive) : null;
    const evidence = { applied, viewed, saved, matchedKeyword: keyword };
    const desired = decideCardAction(evidence, settings);
    const color = highlightColorFor(evidence, settings);

    if (domCurrent !== desired || (desired === "highlight" && getCardHighlightColor(element) !== color)) applyCardAction(element, desired, color);
    if (jobId) setTrackedState(jobId, desired, color);
  }
}

export function restoreAllJobCards(root: ParentNode): void {
  for (const { element } of findJobCards(root)) restoreCard(element);
}
