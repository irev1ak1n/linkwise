import type { JobsSettings } from "../../models/jobsSettings";
import { findJobCards } from "./jobCardDetector";
import { isJobCardApplied, isJobCardSaved, isJobCardViewed } from "./jobStateDetector";
import { extractCardText, matchedKeyword, parseKeywords } from "./keywordMatcher";
import { decideCardAction } from "./jobFilterEngine";
import { applyCardAction, ensureJobStylesInjected, restoreCard } from "./jobCardStyler";

export function processJobCards(root: ParentNode, settings: JobsSettings): void {
  ensureJobStylesInjected(document);
  const keywords = parseKeywords(settings.keywordsText);

  for (const { element } of findJobCards(root)) {
    const applied = isJobCardApplied(element);
    const viewed = isJobCardViewed(element);
    const saved = isJobCardSaved(element);
    const keyword = keywords.length > 0 ? matchedKeyword(extractCardText(element), keywords, settings.caseInsensitive) : null;
    const action = decideCardAction({ applied, viewed, saved, matchedKeyword: keyword }, settings);
    applyCardAction(element, action);
  }
}

export function restoreAllJobCards(root: ParentNode): void {
  for (const { element } of findJobCards(root)) restoreCard(element);
}
