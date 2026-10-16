// Which Saved Profiles page is open, kept across tool switches like analyzerNav.
export type SavedPage = { page: "list" } | { page: "detail"; profileKey: string };

let current: SavedPage = { page: "list" };
const listeners = new Set<() => void>();

export function getSavedPage(): SavedPage {
  return current;
}

export function openSavedPage(next: SavedPage): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function subscribeSavedPage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
