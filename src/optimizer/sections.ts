// The sections Profile Optimizer looks at, and which of them exist on the viewer's own profile.
// Presence comes from what the page shows (headings, photo, banner) plus collected evidence.
import type { LinkedInProfile } from "../models/profile";
import type { EvidencePayloadItem } from "../ai/evidencePayload";
import type { ProfileShell } from "../linkedin/profileAdapter";

export type OptimizerSection =
  | "photo"
  | "banner"
  | "headline"
  | "about"
  | "featured"
  | "experience"
  | "education"
  | "projects"
  | "skills"
  | "certifications"
  | "volunteering"
  | "honors"
  | "organizations"
  | "languages"
  | "location"
  // Settings rather than sections: checked from the page, never part of the AI review.
  | "url"
  | "openToWork"
  | "network";

export interface OptimizerSectionInfo {
  section: OptimizerSection;
  label: string;
  // Share of the overall score. Core sections always count; optional ones only when worth adding.
  weight: number;
  core: boolean;
  // Text sections LinkWise can draft from known evidence.
  draftable: boolean;
}

export const OPTIMIZER_SECTIONS: OptimizerSectionInfo[] = [
  { section: "photo", label: "Profile photo", weight: 6, core: true, draftable: false },
  { section: "banner", label: "Banner", weight: 2, core: false, draftable: false },
  { section: "headline", label: "Headline", weight: 14, core: true, draftable: true },
  { section: "about", label: "About", weight: 12, core: true, draftable: true },
  { section: "featured", label: "Featured", weight: 5, core: false, draftable: false },
  { section: "experience", label: "Experience", weight: 20, core: true, draftable: true },
  { section: "education", label: "Education", weight: 8, core: true, draftable: false },
  { section: "projects", label: "Projects", weight: 5, core: false, draftable: false },
  { section: "skills", label: "Skills", weight: 8, core: true, draftable: false },
  { section: "certifications", label: "Licenses & Certifications", weight: 4, core: false, draftable: false },
  { section: "volunteering", label: "Volunteer Experience", weight: 3, core: false, draftable: false },
  { section: "honors", label: "Honors & Awards", weight: 3, core: false, draftable: false },
  { section: "organizations", label: "Organizations", weight: 2, core: false, draftable: false },
  { section: "languages", label: "Languages", weight: 2, core: false, draftable: false },
  { section: "location", label: "Location", weight: 2, core: false, draftable: false },
];

export function sectionInfo(section: OptimizerSection): OptimizerSectionInfo | undefined {
  return OPTIMIZER_SECTIONS.find((info) => info.section === section);
}

// The overview's grouping, and the exact order Prev / Next follows.
export const SECTION_GROUPS: { title: string; sections: OptimizerSection[] }[] = [
  { title: "Profile", sections: ["photo", "banner", "headline", "about", "featured"] },
  { title: "Experience & credentials", sections: ["experience", "education", "projects", "skills", "certifications", "volunteering", "honors", "organizations", "languages"] },
  { title: "Discoverability", sections: ["location", "url", "openToWork", "network"] },
];

export interface SectionPresence {
  section: OptimizerSection;
  present: boolean;
  itemCount: number | null;
  evidenceIds: string[];
}

const LIST_SECTIONS = ["experience", "education", "projects", "skills", "certifications", "volunteering", "honors", "organizations", "languages"] as const;

export function buildSectionMap(profile: LinkedInProfile, shell: ProfileShell, evidence: EvidencePayloadItem[]): SectionPresence[] {
  const idsFor = (section: string) => evidence.filter((item) => item.section === section).map((item) => item.id);
  return OPTIMIZER_SECTIONS.map(({ section }): SectionPresence => {
    if (section === "photo") return { section, present: shell.hasPhoto, itemCount: null, evidenceIds: [] };
    if (section === "banner") return { section, present: shell.hasBanner, itemCount: null, evidenceIds: [] };
    if (section === "featured") return { section, present: "featured" in shell.sections, itemCount: shell.sections.featured ?? null, evidenceIds: [] };
    if (section === "headline" || section === "location") return { section, present: !!profile[section], itemCount: null, evidenceIds: idsFor(section) };
    if (section === "about") return { section, present: "about" in shell.sections || !!profile.about, itemCount: null, evidenceIds: idsFor(section) };
    const list = section as (typeof LIST_SECTIONS)[number];
    const collected = profile[list].length;
    const present = list in shell.sections || collected > 0;
    return { section, present, itemCount: present ? (shell.sections[list] ?? collected) : null, evidenceIds: idsFor(section) };
  });
}
