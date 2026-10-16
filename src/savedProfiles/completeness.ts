import { ALL_PROFILE_SECTIONS, type LinkedInProfile } from "../models/profile";
import type { ProfileSession } from "../storage/profileSessionRepository";
import type { ChangeSection } from "./types";

// Sections whose every entry LinkWise has seen: their details page was read, or the main page was
// read to the end and showed the whole list without a "Show all" link.
export function completeSections(session: ProfileSession | null, profile: LinkedInProfile): ChangeSection[] {
  const sections: ChangeSection[] = [];
  if (profile.headline) sections.push("headline");
  if (profile.about) sections.push("about");
  if (!session) return sections;
  const mainRead = session.scannedSections.includes("main") && Array.isArray(session.truncatedSections);
  for (const section of ALL_PROFILE_SECTIONS) {
    if (section === "about") continue;
    if (session.scannedSections.includes(section) || (mainRead && !session.truncatedSections!.includes(section))) sections.push(section);
  }
  return sections;
}
