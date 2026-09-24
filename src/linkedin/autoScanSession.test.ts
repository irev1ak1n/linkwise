import { describe, expect, it } from "vitest";
import {
  forceCompleteSession,
  hasExceededOverallTimeout,
  isSessionComplete,
  isUrlAlreadyDone,
  markCurrentSectionDone,
  markCurrentSectionFailed,
  nextPendingSection,
  startAutoScanSession,
  type AutoScanSession,
} from "./autoScanSession";

function section(type: string, name: string) {
  return {
    type: type as never,
    heading: name,
    url: `https://www.linkedin.com/in/irev1ak1n/details/${name.toLowerCase()}/`,
    normalizedUrl: `https://www.linkedin.com/in/irev1ak1n/details/${name.toLowerCase()}/`,
  };
}

// Simulates a full page unload and a fresh content script recovering the persisted session —
// the exact same plain object, since nothing here ever touches storage directly.
function recover(session: AutoScanSession): AutoScanSession {
  return JSON.parse(JSON.stringify(session));
}

describe("autoScanSession - the exact specified regression sequence", () => {
  it("visits Skills, Education, Projects, Honors once each, in order, surviving recovery between every step", () => {
    let session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [
      section("skills", "Skills"),
      section("education", "Education"),
      section("projects", "Projects"),
      section("honors", "Honors"),
    ]);
    const sessionId = session.sessionId;
    expect(session.currentIndex).toBe(0);
    expect(session.sections.every((s) => s.status === "pending")).toBe(true);

    expect(nextPendingSection(session)?.heading).toBe("Skills");
    session = markCurrentSectionDone(session);
    expect(session.sections[0].status).toBe("done");
    expect(session.currentIndex).toBe(1);

    session = recover(session);
    expect(session.sessionId).toBe(sessionId);
    expect(session.profileKey).toBe("irev1ak1n");
    expect(session.sections[0].status).toBe("done");
    expect(nextPendingSection(session)?.heading).toBe("Education");

    session = markCurrentSectionDone(session);
    session = recover(session);
    expect(session.sections[0].status).toBe("done");
    expect(session.sections[1].status).toBe("done");
    expect(nextPendingSection(session)?.heading).toBe("Projects");

    session = markCurrentSectionDone(session);
    session = recover(session);
    expect(nextPendingSection(session)?.heading).toBe("Honors");

    session = markCurrentSectionDone(session);
    expect(session.sections.every((s) => s.status === "done")).toBe(true);
    expect(isSessionComplete(session)).toBe(true);
    expect(nextPendingSection(session)).toBeNull();

    // Back on the main profile: nothing left to do, no section reopens.
    expect(isUrlAlreadyDone(session, section("skills", "Skills").normalizedUrl)).toBe(true);
  });
});

describe("autoScanSession - failure handling", () => {
  it("retries a failed section once, then marks it failed and continues, never stalling the scan", () => {
    let session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [
      section("skills", "Skills"),
      section("education", "Education"),
      section("honors", "Honors"),
    ]);

    session = markCurrentSectionDone(session); // Skills succeeds
    expect(session.sections[0].status).toBe("done");
    expect(nextPendingSection(session)?.heading).toBe("Education");

    session = markCurrentSectionFailed(session); // Education times out once, retried
    expect(session.sections[1].status).toBe("pending");
    expect(session.sections[1].attempts).toBe(1);
    expect(session.currentIndex).toBe(1); // still on Education, not advanced yet

    session = markCurrentSectionFailed(session); // fails again, retry limit reached
    expect(session.sections[1].status).toBe("failed");
    expect(session.currentIndex).toBe(2);
    expect(nextPendingSection(session)?.heading).toBe("Honors");

    session = markCurrentSectionDone(session);
    expect(isSessionComplete(session)).toBe(true);
    expect(session.sections.map((s) => s.status)).toEqual(["done", "failed", "done"]);
  });
});

describe("autoScanSession - never reopens a completed section", () => {
  it("a done section is never returned by nextPendingSection again", () => {
    let session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [
      section("skills", "Skills"),
      section("education", "Education"),
    ]);
    session = markCurrentSectionDone(session);
    // Calling done again on an already-advanced session must never re-trigger Skills.
    const before = JSON.stringify(session);
    expect(nextPendingSection(session)?.heading).toBe("Education");
    expect(JSON.stringify(session)).toBe(before);
  });

  it("isUrlAlreadyDone is false until the section actually completes", () => {
    let session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [section("skills", "Skills")]);
    const url = session.sections[0].normalizedUrl;
    expect(isUrlAlreadyDone(session, url)).toBe(false);
    session = markCurrentSectionDone(session);
    expect(isUrlAlreadyDone(session, url)).toBe(true);
  });
});

describe("autoScanSession - discovery produced no queueable sections", () => {
  it("starts already complete when nothing was discovered", () => {
    const session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", []);
    expect(isSessionComplete(session)).toBe(true);
    expect(nextPendingSection(session)).toBeNull();
  });
});

describe("autoScanSession - overall scan timeout", () => {
  it("detects when the whole session has run past the allowed duration", () => {
    const session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [section("skills", "Skills")], 1000);
    expect(hasExceededOverallTimeout(session, 5000, 1000 + 5001)).toBe(true);
    expect(hasExceededOverallTimeout(session, 5000, 1000 + 4000)).toBe(false);
  });

  it("forceCompleteSession marks every non-done section failed and ends the scan, never hanging", () => {
    let session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [
      section("skills", "Skills"),
      section("education", "Education"),
      section("projects", "Projects"),
    ]);
    session = markCurrentSectionDone(session); // Skills done, Education is current

    session = forceCompleteSession(session);

    expect(session.status).toBe("complete");
    expect(session.sections.map((s) => s.status)).toEqual(["done", "failed", "failed"]);
    expect(nextPendingSection(session)).toBeNull();
  });
});
