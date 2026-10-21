// What the user adds under "Missed something?" on each section's page: information LinkWise could
// not find on their profile. It is user-provided context, never LinkedIn evidence: it joins the
// "Anything not on your LinkedIn profile?" text the analysis already treats as such, labeled by
// section, and nothing here is sent anywhere until the one analysis that follows a save.
import { createStoredPreference } from "../linkedin/panel/storedPreference";
import { MAX_USER_CONTEXT_CHARS } from "./optimizerPreferences";
import type { OptimizerSection } from "./sections";
import { DETAIL_SECTIONS, SECTION_GUIDANCE } from "./sectionGuidance";

export const SECTION_NOTES_STORAGE_KEY = "finder.optimizerSectionNotes.v1";
export const MAX_SECTION_NOTE_CHARS = 500;

/** Notes by profile, then by section. */
export type SectionNotesStore = Record<string, Partial<Record<OptimizerSection, string>>>;

const KNOWN = new Set<string>(DETAIL_SECTIONS);

function parse(stored: unknown): SectionNotesStore | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const store: SectionNotesStore = {};
  for (const [profileKey, notes] of Object.entries(stored as Record<string, unknown>)) {
    if (!notes || typeof notes !== "object") continue;
    for (const [section, text] of Object.entries(notes as Record<string, unknown>)) {
      if (KNOWN.has(section) && typeof text === "string" && text.trim()) (store[profileKey] ??= {})[section as OptimizerSection] = text.slice(0, MAX_SECTION_NOTE_CHARS);
    }
  }
  return store;
}

export const sectionNotesPreference = createStoredPreference<SectionNotesStore>(SECTION_NOTES_STORAGE_KEY, {}, parse);

export function setSectionNote(profileKey: string | null | undefined, section: OptimizerSection, text: string): void {
  if (!profileKey) return;
  const store = sectionNotesPreference.getState().value;
  const notes = { ...(store[profileKey] ?? {}) };
  const clean = text.trim().slice(0, MAX_SECTION_NOTE_CHARS);
  if (clean) notes[section] = clean;
  else delete notes[section];
  sectionNotesPreference.set({ ...store, [profileKey]: notes });
}

/**
 * The context the whole-profile analysis is given: what the user wrote in the general box, then
 * each section note under its section's name, in profile order. Kept under the request limit by
 * dropping whole trailing notes, never by cutting one off mid-sentence.
 */
export function composeUserContext(general: string, notes: Partial<Record<OptimizerSection, string>> | undefined): string {
  const parts = [general.trim()].filter(Boolean);
  let used = parts.join("\n\n").length;
  for (const section of DETAIL_SECTIONS) {
    const text = notes?.[section]?.trim();
    if (!text) continue;
    const line = `[${SECTION_GUIDANCE[section].title}] ${text}`;
    if (used + line.length + 2 > MAX_USER_CONTEXT_CHARS) break;
    parts.push(line);
    used += line.length + 2;
  }
  return parts.join("\n\n");
}
