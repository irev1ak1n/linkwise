// The Auto scan checklist: a fixed, persisted queue of profile detail pages to visit once,
// in order. Pure state transitions only, no DOM/chrome access, so the exact navigation
// sequence is fully testable without a browser. content.ts drives the actual navigation from
// this state, never the other way around.
import type { ProfileSectionName } from "../models/profile";

export type SectionStatus = "pending" | "scanning" | "done" | "failed";

export interface QueuedSection {
  type: ProfileSectionName | "unknown";
  heading: string;
  url: string;
  normalizedUrl: string;
  status: SectionStatus;
  attempts: number;
}

export type ScanSessionStatus = "scanning" | "complete";

export interface AutoScanSession {
  sessionId: string;
  profileKey: string;
  originalProfileUrl: string;
  sections: QueuedSection[];
  currentIndex: number;
  status: ScanSessionStatus;
  startedAt: number;
}

export interface DiscoveredSectionInput {
  type: ProfileSectionName | "unknown";
  heading: string;
  url: string;
  normalizedUrl: string;
}

let sessionCounter = 0;
function generateSessionId(): string {
  sessionCounter += 1;
  return `scan_${Date.now().toString(36)}_${sessionCounter}`;
}

// The queue is frozen here and never rebuilt for the life of this session. Only sections with
// a real detail page are queued — About/Skills-without-a-detail-page stay main-page-only.
export function startAutoScanSession(
  profileKey: string,
  originalProfileUrl: string,
  discovered: DiscoveredSectionInput[],
  now = Date.now(),
): AutoScanSession {
  return {
    sessionId: generateSessionId(),
    profileKey,
    originalProfileUrl,
    sections: discovered.map((section) => ({ ...section, status: "pending", attempts: 0 })),
    currentIndex: 0,
    status: discovered.length > 0 ? "scanning" : "complete",
    startedAt: now,
  };
}

// The one section to act on next, or null once nothing is left. Never returns a section
// that's already done or exhausted its retries, so a caller can't accidentally reopen one.
export function nextPendingSection(session: AutoScanSession): QueuedSection | null {
  const section = session.sections[session.currentIndex];
  if (!section) return null;
  if (section.status === "done" || section.status === "failed") return null;
  return section;
}

// A URL already fully scanned this session, checked before ever navigating to it. The one
// guard that makes the old main -> Skills -> main -> Skills loop structurally impossible.
export function isUrlAlreadyDone(session: AutoScanSession, normalizedUrl: string): boolean {
  return session.sections.some((s) => s.normalizedUrl === normalizedUrl && s.status === "done");
}

function advance(session: AutoScanSession): AutoScanSession {
  const currentIndex = session.currentIndex + 1;
  const status: ScanSessionStatus = currentIndex >= session.sections.length ? "complete" : "scanning";
  return { ...session, currentIndex, status };
}

export function markCurrentSectionScanning(session: AutoScanSession): AutoScanSession {
  return {
    ...session,
    sections: session.sections.map((s, i) => (i === session.currentIndex ? { ...s, status: "scanning" } : s)),
  };
}

// Marks the current section done and moves on. A section that's already done or out of range
// is a no-op, so a stray duplicate call can never double-advance the queue.
export function markCurrentSectionDone(session: AutoScanSession): AutoScanSession {
  const section = session.sections[session.currentIndex];
  if (!section || section.status === "done") return session;
  const sections = session.sections.map((s, i) => (i === session.currentIndex ? { ...s, status: "done" as const } : s));
  return advance({ ...session, sections });
}

// One bounded retry: a first failure just increments attempts and stays pending, so the same
// section gets tried again before ever being given up on. Only exhausting maxAttempts marks it
// failed and moves the queue on, so one broken section can never stall the whole scan.
export function markCurrentSectionFailed(session: AutoScanSession, maxAttempts = 2): AutoScanSession {
  const section = session.sections[session.currentIndex];
  if (!section) return session;
  const attempts = section.attempts + 1;
  if (attempts < maxAttempts) {
    const sections = session.sections.map((s, i) => (i === session.currentIndex ? { ...s, status: "pending" as const, attempts } : s));
    return { ...session, sections };
  }
  const sections = session.sections.map((s, i) => (i === session.currentIndex ? { ...s, status: "failed" as const, attempts } : s));
  return advance({ ...session, sections });
}

export function isSessionComplete(session: AutoScanSession): boolean {
  return session.status === "complete";
}

export function hasExceededOverallTimeout(session: AutoScanSession, maxDurationMs: number, now = Date.now()): boolean {
  return now - session.startedAt > maxDurationMs;
}

// The overall-scan-timeout escape hatch: whatever isn't already done gets marked failed and
// the session ends, rather than a broken page hanging the scan forever.
export function forceCompleteSession(session: AutoScanSession): AutoScanSession {
  const sections = session.sections.map((s) => (s.status === "done" ? s : { ...s, status: "failed" as const }));
  return { ...session, sections, currentIndex: sections.length, status: "complete" };
}
