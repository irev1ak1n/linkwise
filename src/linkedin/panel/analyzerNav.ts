// Which Profile Analyzer page is open. Module state, so switching tools or LinkedIn's in-page
// navigation never drops it, and opening a page never touches the analysis itself.
export type AnalyzerPage = "home" | "full" | "evidence";

let page: AnalyzerPage = "home";
let pageProfile: string | null = null;
const listeners = new Set<() => void>();

export function getAnalyzerPage(): AnalyzerPage {
  return page;
}

export function openAnalyzerPage(next: AnalyzerPage): void {
  page = next;
  listeners.forEach((listener) => listener());
}

export function subscribeAnalyzerPage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// A different person's profile starts from the dashboard; reopening the panel on the same one doesn't.
export function syncAnalyzerProfile(profileKey: string | null): void {
  if (profileKey === pageProfile) return;
  pageProfile = profileKey;
  if (page !== "home") openAnalyzerPage("home");
}
