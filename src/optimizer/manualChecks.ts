// The user's own answers to checklist items: ones only a person can judge, such as a photo's
// lighting, and overrides of what LinkWise found by itself. Stored per own profile and tied to the image they were given for, so a new
// photo starts its checks fresh while every other answer stays. Answering is purely local: it updates
// the checklist, the section's status and the score, and never sends anything anywhere.
import { createStoredPreference } from "../linkedin/panel/storedPreference";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { CHECKLISTS } from "./checklist";
import type { OptimizerSection } from "./sections";

export const MANUAL_CHECKS_STORAGE_KEY = "finder.optimizerManualChecks.v1";

export interface ManualAnswer {
  value: boolean;
  /** The image the answer was about (see ProfileShell.photoId), or null when it isn't about an image. */
  fingerprint: string | null;
}

/** Answers by profile, then by criterion id. */
export type ManualCheckStore = Record<string, Record<string, ManualAnswer>>;

function parse(stored: unknown): ManualCheckStore | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const store: ManualCheckStore = {};
  for (const [profileKey, answers] of Object.entries(stored as Record<string, unknown>)) {
    if (!answers || typeof answers !== "object") continue;
    for (const [id, answer] of Object.entries(answers as Record<string, unknown>)) {
      const { value, fingerprint } = (answer ?? {}) as Partial<ManualAnswer>;
      if (typeof value !== "boolean") continue;
      (store[profileKey] ??= {})[id] = { value, fingerprint: typeof fingerprint === "string" ? fingerprint : null };
    }
  }
  return store;
}

export const manualChecksPreference = createStoredPreference<ManualCheckStore>(MANUAL_CHECKS_STORAGE_KEY, {}, parse);

// Every checklist item can be answered, including ones LinkWise checks itself (the answer then overrides it).
const SECTION_OF = new Map<string, OptimizerSection>(
  (Object.keys(CHECKLISTS) as OptimizerSection[]).flatMap((section) => CHECKLISTS[section].map((criterion) => [criterion.id, section] as const)),
);

/** What a section's answers depend on: the photo or banner image itself. */
export function sectionFingerprint(section: OptimizerSection, shell: ProfileShell | null | undefined): string | null {
  if (section === "photo") return shell?.photoId ?? null;
  if (section === "banner") return shell?.bannerId ?? null;
  return null;
}

/** The answers that still apply to this profile as it is now. An answer about a different photo or
 * banner than the one on the page no longer counts, so that check asks again. */
export function currentAnswers(store: ManualCheckStore, profileKey: string | null | undefined, shell: ProfileShell | null | undefined): Record<string, boolean> {
  const answers: Record<string, boolean> = {};
  if (!profileKey) return answers;
  for (const [id, answer] of Object.entries(store[profileKey] ?? {})) {
    const section = SECTION_OF.get(id);
    if (!section) continue;
    const now = sectionFingerprint(section, shell);
    if (answer.fingerprint && now && answer.fingerprint !== now) continue;
    answers[id] = answer.value;
  }
  return answers;
}

/** Records the user's answer, or clears it with null. */
export function setManualAnswer(profileKey: string | null | undefined, criterionId: string, value: boolean | null, shell: ProfileShell | null | undefined): void {
  const section = SECTION_OF.get(criterionId);
  if (!profileKey || !section) return;
  const store = manualChecksPreference.getState().value;
  const answers = { ...(store[profileKey] ?? {}) };
  if (value === null) delete answers[criterionId];
  else answers[criterionId] = { value, fingerprint: sectionFingerprint(section, shell) };
  manualChecksPreference.set({ ...store, [profileKey]: answers });
}
