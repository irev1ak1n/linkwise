// Assigns a stable ID to every piece of profile text sent to the LinkWise backend, so its
// OpenAI reasoning layer can reference actual evidence ("experience:0", "education:1", ...)
// instead of writing free-floating claims. IDs come straight from `profileTextFields` — the
// SAME list every local matcher already scans — so a strength the local engine already found is
// trivially traceable to the same ID an AI-cited claim would use.
import { profileTextFields, type LinkedInProfile, type ProfileSectionName } from "../models/profile";

export interface EvidencePayloadItem {
  id: string;
  section: ProfileSectionName | "headline" | "location";
  text: string;
  /** Currently always equal to `section` — a separate field per the backend's wire contract,
   * kept distinct in case a finer-grained classification (e.g. "job" vs "internship") is worth
   * adding later without renaming the section field everything else already relies on. */
  evidenceType: string;
}

/** Deterministic within one call: fields keep `profileTextFields`' own order, IDs are assigned
 * as `${section}:${index within that section}` — stable for the lifetime of one analysis
 * request/response round trip, which is all evidence-ID stability needs to guarantee here. */
export function buildEvidencePayload(profile: LinkedInProfile): EvidencePayloadItem[] {
  const counters: Partial<Record<string, number>> = {};
  return profileTextFields(profile).map((field) => {
    const index = counters[field.section] ?? 0;
    counters[field.section] = index + 1;
    return { id: `${field.section}:${index}`, section: field.section, text: field.text, evidenceType: field.section };
  });
}

/** Best-effort reverse lookup: given a source section and a (possibly truncated) evidence
 * snippet the LOCAL matcher already produced, finds the matching payload item's stable ID.
 * `truncateSnippet` (see matching/textNormalize.ts) always yields a genuine contiguous
 * substring of the original field text, optionally bracketed with a leading and/or trailing
 * "…" when it had to cut the text down — stripping those markers before comparing makes a
 * plain substring match reliable either way. Returns undefined rather than guessing when
 * nothing matches. */
export function findEvidenceId(
  payload: EvidencePayloadItem[],
  section: ProfileSectionName | "headline" | "location",
  snippet: string,
): string | undefined {
  const needle = snippet.replace(/^…/, "").replace(/…$/, "").trim();
  if (!needle) return undefined;
  return payload.find((item) => item.section === section && item.text.includes(needle))?.id;
}
