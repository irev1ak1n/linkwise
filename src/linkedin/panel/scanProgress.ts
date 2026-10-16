// The scan screen's state, derived only from real scanning signals: which sections the page shows,
// which ones evidence was extracted from, the Auto scan crawl queue, and the analysis request.
// Nothing here advances on a timer.
import type { CollectionState } from "../../models/collection";
import type { LinkedInProfile, ProfileSectionName } from "../../models/profile";
import type { AutoScanProgress } from "./panelStore";
import type { ScanMode } from "./scanModeStore";
import { detailsPageSection } from "../profileAdapter";

export type SectionScanStatus = "pending" | "scanning" | "complete" | "not_found" | "skipped";
export type ScanStatus = "scanning" | "analyzing" | "complete" | "error";

export interface SectionScan {
  section: ProfileSectionName;
  status: SectionScanStatus;
  /** Distinct entries extracted, only for sections where a count means something. */
  count?: number;
  note?: string;
}

export interface ScanState {
  status: ScanStatus;
  sections: SectionScan[];
  active: SectionScan | null;
  /** 0–100, from resolved stages only. */
  progress: number;
  message: string;
}

// Rows shown even before the page reveals them, so a missing one can be reported as not found.
const EXPECTED: ProfileSectionName[] = ["about", "experience", "projects", "education", "skills", "certifications", "languages", "honors"];
// Shown only when the profile has them.
const OPTIONAL: ProfileSectionName[] = ["volunteering", "organizations"];

const ACTIVE_MESSAGE: Record<ProfileSectionName, string> = {
  about: "Reading About…",
  experience: "Scanning experience…",
  projects: "Looking at projects…",
  education: "Reviewing education…",
  skills: "Finding relevant skills…",
  certifications: "Checking certifications…",
  languages: "Reviewing languages…",
  honors: "Finding achievements…",
  volunteering: "Reviewing volunteering…",
  organizations: "Checking organizations…",
};

export function evidenceCount(profile: LinkedInProfile | null, section: ProfileSectionName): number | undefined {
  if (!profile || section === "about") return undefined;
  const count = profile[section].length;
  return count > 0 ? count : undefined;
}

export interface ScanInput {
  mode: ScanMode;
  collection: CollectionState;
  profile: LinkedInProfile | null;
  autoScanProgress?: AutoScanProgress | null;
  /** Collection is final and the analysis request is in flight. */
  analyzing: boolean;
  /** The analysis result is ready. */
  done: boolean;
  /** The scan stopped without settling. */
  failed?: boolean;
}

export function deriveScanState(input: ScanInput): ScanState {
  const { collection, profile, mode } = input;
  const detected = new Set(collection.sectionsDetected);
  const found = new Set(collection.sectionsFound);
  // The whole main page has been read, so a section it never showed is genuinely absent. Analyze as I
  // scroll analyzes what is visible early, so only reaching the bottom counts there.
  const mainRead = collection.reachedDocumentEnd || (mode === "auto" && (collection.status === "settled" || input.analyzing || input.done));

  const crawl = new Map<ProfileSectionName, string>();
  for (const page of input.autoScanProgress?.sections ?? []) {
    const section = detailsPageSection(page.url);
    if (section) crawl.set(section, page.status);
  }

  const order = [...EXPECTED, ...OPTIONAL.filter((s) => detected.has(s) || found.has(s) || crawl.has(s))];
  let activeAssigned = false;
  const sections: SectionScan[] = order.map((section) => {
    const count = evidenceCount(profile, section);
    const page = crawl.get(section);
    if (page === "scanning") {
      activeAssigned = true;
      return { section, status: "scanning", count, note: "Reading full list" };
    }
    if (page === "failed") return found.has(section) ? { section, status: "complete", count, note: "Full list unavailable" } : { section, status: "skipped", note: "Could not open" };
    if (page === "pending" && !input.done) return { section, status: "pending", count, note: found.has(section) ? "Full list queued" : undefined };
    if (found.has(section)) return { section, status: "complete", count, note: page === "done" ? "Full list read" : undefined };
    if (detected.has(section) && !mainRead && !activeAssigned) {
      activeAssigned = true;
      return { section, status: "scanning" };
    }
    if (mainRead) return { section, status: "not_found", note: "Not found" };
    return { section, status: "pending" };
  });

  const active = sections.find((s) => s.status === "scanning") ?? null;
  const resolved = sections.filter((s) => s.status === "complete" || s.status === "not_found" || s.status === "skipped").length;
  // One more stage after the sections: the analysis itself.
  const stages = sections.length + 1;
  const status: ScanStatus = input.done ? "complete" : input.failed ? "error" : input.analyzing ? "analyzing" : "scanning";
  const progress = status === "complete" ? 100 : Math.min(95, Math.round(((resolved + (status === "analyzing" ? 0.5 : 0)) / stages) * 100));

  let message: string;
  if (status === "complete") message = mode === "scroll" && !mainRead ? "Analysis ready for what you have read so far" : "Profile scan complete";
  else if (status === "error") message = "Could not finish scanning";
  else if (status === "analyzing") message = "Analyzing match…";
  else if (active) message = ACTIVE_MESSAGE[active.section];
  else if (mode === "scroll") message = "Scroll the profile to load more information";
  else if (sections.some((s) => s.status === "pending")) message = "Scanning profile…";
  else message = "Preparing analysis…";

  return { status, sections, active, progress, message };
}
