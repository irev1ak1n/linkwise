// Which Profile Optimizer page is open. Module state, so it survives panel re-renders and LinkedIn's
// in-page navigation without rescanning anything.
import type { OptimizerSection } from "./sections";
import { DETAIL_SECTIONS } from "./sectionGuidance";

export type OptimizerPage = { name: "home" } | { name: "section"; section: OptimizerSection } | { name: "generate"; section: "headline" };

let page: OptimizerPage = { name: "home" };
const listeners = new Set<() => void>();

export function getOptimizerPage(): OptimizerPage {
  return page;
}

export function openOptimizerPage(next: OptimizerPage): void {
  page = next;
  listeners.forEach((listener) => listener());
}

export function subscribeOptimizerPage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function neighborSections(section: OptimizerSection): { prev: OptimizerSection | null; next: OptimizerSection | null } {
  const index = DETAIL_SECTIONS.indexOf(section);
  return { prev: DETAIL_SECTIONS[index - 1] ?? null, next: index >= 0 ? (DETAIL_SECTIONS[index + 1] ?? null) : null };
}
