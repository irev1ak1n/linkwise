// Assigns a stable ID to every piece of profile text sent to the backend, so OpenAI can cite
// real evidence ("experience:0", "education:1") instead of free-floating claims.
import { profileTextFields, type LinkedInProfile, type ProfileSectionName } from "../models/profile";

export interface EvidencePayloadItem {
  id: string;
  section: ProfileSectionName | "headline" | "location";
  text: string;
  /** Currently always equal to section, kept separate for a finer classification later. */
  evidenceType: string;
}

// IDs are assigned as section:index, stable for one analysis round trip.
export function buildEvidencePayload(profile: LinkedInProfile): EvidencePayloadItem[] {
  const counters: Partial<Record<string, number>> = {};
  return profileTextFields(profile).map((field) => {
    const index = counters[field.section] ?? 0;
    counters[field.section] = index + 1;
    return { id: `${field.section}:${index}`, section: field.section, text: field.text, evidenceType: field.section };
  });
}

// Finds the evidence ID matching a (possibly truncated) local snippet. Strips the "…"
// truncation markers first so the substring match still works. Undefined if nothing matches.
export function findEvidenceId(
  payload: EvidencePayloadItem[],
  section: ProfileSectionName | "headline" | "location",
  snippet: string,
): string | undefined {
  const needle = snippet.replace(/^…/, "").replace(/…$/, "").trim();
  if (!needle) return undefined;
  return payload.find((item) => item.section === section && item.text.includes(needle))?.id;
}
