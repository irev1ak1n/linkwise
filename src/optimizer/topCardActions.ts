import { findTopCardPart, type TopCardPart } from "../linkedin/profileAdapter";

// Brings a top-card part into view on the profile.
export function goToTopCardPart(part: TopCardPart, doc: Document = document): boolean {
  const { element } = findTopCardPart(part, doc);
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
  return !!element;
}

// Opens LinkedIn's own editor for a part. LinkWise never changes anything itself.
export function openLinkedInEditor(part: TopCardPart, doc: Document = document): boolean {
  const { editControl } = findTopCardPart(part, doc);
  editControl?.click();
  return !!editControl;
}
