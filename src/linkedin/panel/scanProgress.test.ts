import { describe, expect, it } from "vitest";
import { EMPTY_PROFILE, type LinkedInProfile } from "../../models/profile";
import type { CollectionState } from "../../models/collection";
import { deriveScanState, type ScanInput } from "./scanProgress";

const collection = (overrides: Partial<CollectionState> = {}): CollectionState => ({
  status: "collecting",
  sectionsFound: [],
  sectionsDetected: [],
  lastChangedAt: 0,
  reachedDocumentEnd: false,
  ...overrides,
});

const profile: LinkedInProfile = {
  ...EMPTY_PROFILE,
  name: "Jordan Rivera",
  about: "Builds websites.",
  experience: [{ title: "Developer" }, { title: "Tutor" }],
  skills: ["React", "SQL", "Python"],
  extracted: true,
};

function state(overrides: Partial<ScanInput> = {}) {
  return deriveScanState({ mode: "auto", collection: collection(), profile, analyzing: false, done: false, ...overrides });
}

const statusOf = (s: ReturnType<typeof state>) => Object.fromEntries(s.sections.map((row) => [row.section, row.status]));

describe("deriveScanState", () => {
  it("starts with every expected section pending and nothing resolved", () => {
    const s = state({ profile: null });
    expect(s.sections.map((r) => r.section)).toEqual(["about", "experience", "projects", "education", "skills", "certifications", "languages", "honors"]);
    expect(s.sections.every((r) => r.status === "pending")).toBe(true);
    expect(s.progress).toBe(0);
    expect(s.message).toBe("Scanning profile…");
  });

  it("marks a section scanning once the page shows it, and complete only once evidence was extracted", () => {
    const reading = state({ collection: collection({ sectionsDetected: ["about", "experience"], sectionsFound: ["about"] }) });
    expect(statusOf(reading)).toMatchObject({ about: "complete", experience: "scanning", skills: "pending" });
    expect(reading.message).toBe("Scanning experience…");

    const read = state({ collection: collection({ sectionsDetected: ["about", "experience"], sectionsFound: ["about", "experience"] }) });
    expect(statusOf(read)).toMatchObject({ about: "complete", experience: "complete" });
    expect(read.sections.find((r) => r.section === "experience")!.count).toBe(2);
    expect(read.progress).toBeGreaterThan(reading.progress);
  });

  it("reports sections the fully read page never showed as not found", () => {
    const s = state({ collection: collection({ status: "settled", reachedDocumentEnd: true, sectionsDetected: ["about", "experience", "skills"], sectionsFound: ["about", "experience", "skills"] }) });
    expect(statusOf(s)).toMatchObject({ projects: "not_found", education: "not_found", skills: "complete" });
    expect(s.sections.find((r) => r.section === "skills")!.count).toBe(3);
  });

  it("follows the Auto scan crawl through each details page", () => {
    const s = state({
      collection: collection({ status: "settled", reachedDocumentEnd: true, sectionsDetected: ["about", "experience", "skills"], sectionsFound: ["about", "experience", "skills"] }),
      autoScanProgress: {
        sessionId: "s",
        status: "scanning",
        currentIndex: 1,
        sections: [
          { heading: "Experience", url: "https://www.linkedin.com/in/jordan/details/experience/", status: "done" },
          { heading: "Skills", url: "https://www.linkedin.com/in/jordan/details/skills/", status: "scanning" },
          { heading: "Projects", url: "https://www.linkedin.com/in/jordan/details/projects/", status: "failed" },
        ],
      },
    });
    expect(s.sections.find((r) => r.section === "experience")).toMatchObject({ status: "complete", note: "Full list read" });
    expect(s.active).toMatchObject({ section: "skills", status: "scanning", note: "Reading full list" });
    expect(s.sections.find((r) => r.section === "projects")).toMatchObject({ status: "skipped", note: "Could not open" });
    expect(s.message).toBe("Finding relevant skills…");
  });

  it("keeps queued details pages pending instead of claiming them complete", () => {
    const s = state({
      collection: collection({ status: "settled", sectionsDetected: ["experience"], sectionsFound: ["experience"] }),
      autoScanProgress: { sessionId: "s", status: "scanning", currentIndex: 0, sections: [{ heading: "Experience", url: "https://www.linkedin.com/in/jordan/details/experience/", status: "pending" }] },
    });
    expect(s.sections.find((r) => r.section === "experience")).toMatchObject({ status: "pending", note: "Full list queued" });
  });

  it("in Analyze as I scroll, leaves unvisited sections pending and asks the user to scroll", () => {
    const s = state({ mode: "scroll", collection: collection({ sectionsDetected: ["about"], sectionsFound: ["about"] }) });
    expect(statusOf(s)).toMatchObject({ about: "complete", experience: "pending", projects: "pending" });
    expect(s.message).toBe("Scroll the profile to load more information");
    const bottom = state({ mode: "scroll", collection: collection({ reachedDocumentEnd: true, sectionsDetected: ["about"], sectionsFound: ["about"] }) });
    expect(statusOf(bottom).experience).toBe("not_found");
  });

  it("never calls unvisited sections missing just because scroll mode started analyzing early", () => {
    const s = state({ mode: "scroll", analyzing: true, collection: collection({ status: "settled", sectionsDetected: ["about"], sectionsFound: ["about"] }) });
    expect(statusOf(s)).toMatchObject({ about: "complete", experience: "pending", projects: "pending" });
    const ready = state({ mode: "scroll", done: true, collection: collection({ status: "settled", sectionsDetected: ["about"], sectionsFound: ["about"] }) });
    expect(ready.message).toBe("Analysis ready for what you have read so far");
  });

  it("shows optional sections only when the profile has them", () => {
    expect(state().sections.some((r) => r.section === "volunteering")).toBe(false);
    expect(state({ collection: collection({ sectionsDetected: ["volunteering"] }) }).sections.some((r) => r.section === "volunteering")).toBe(true);
  });

  it("holds below 100% while analyzing and reaches 100% only when the analysis is ready", () => {
    const settled = collection({ status: "settled", reachedDocumentEnd: true, sectionsDetected: ["about"], sectionsFound: ["about"] });
    const analyzing = state({ collection: settled, analyzing: true });
    expect(analyzing).toMatchObject({ status: "analyzing", message: "Analyzing match…" });
    expect(analyzing.progress).toBeLessThan(100);
    expect(analyzing.progress).toBeGreaterThan(state({ collection: settled }).progress);
    expect(state({ collection: settled, done: true })).toMatchObject({ status: "complete", progress: 100, message: "Profile scan complete" });
  });

  it("reports a failed scan without dropping what was read", () => {
    const s = state({ failed: true, collection: collection({ sectionsDetected: ["about"], sectionsFound: ["about"] }) });
    expect(s).toMatchObject({ status: "error", message: "Could not finish scanning" });
    expect(statusOf(s).about).toBe("complete");
  });
});
