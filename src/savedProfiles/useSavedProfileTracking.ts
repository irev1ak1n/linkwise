import { useCallback, useEffect, useRef, useState } from "react";
import type { Goal } from "../models/goal";
import type { LinkedInProfile } from "../models/profile";
import type { FinalAnalysis } from "../ai/mergeIntoAnalysis";
import { loadProfileSession } from "../storage/profileSessionRepository";
import { saveProfile, updateSavedProfile } from "../storage/savedProfilesRepository";
import { completeSections } from "./completeness";
import { snapshotAnalysis, snapshotGoal } from "./goalImpact";
import { VISIT_WINDOW_MS, checkSavedProfile, evidenceHash } from "./savedProfileCheck";
import { resolveTextPairs } from "./semanticCompareClient";
import { refreshSavedProfiles, useSavedProfile } from "./savedProfilesStore";
import type { SavedProfile } from "./types";

const CHECK_DELAY_MS = 1500;

interface TrackingInput {
  profileKey: string | null;
  profile: LinkedInProfile;
  goal: Goal;
  final: FinalAnalysis;
  /** The analysis is final and not mid-update, so it can be compared and stored. */
  ready: boolean;
}

// Saving a person, and comparing them with their saved snapshot whenever their evidence or
// analysis settles on a revisit.
export function useSavedProfileTracking({ profileKey, profile, goal, final, ready }: TrackingInput): {
  saved: SavedProfile | null;
  checking: boolean;
  save: () => Promise<void>;
} {
  const { saved } = useSavedProfile(profileKey);
  const [checking, setChecking] = useState(false);
  const checked = useRef<string | null>(null);

  const save = useCallback(async () => {
    if (!profileKey) return;
    const session = await loadProfileSession(profileKey);
    const now = Date.now();
    await saveProfile({
      profileKey,
      profileName: profile.name ?? profileKey,
      profileUrl: `https://www.linkedin.com/in/${profileKey}/`,
      record: { recordedAt: now, origin: "saved", profile, completeSections: completeSections(session, profile), goal: snapshotGoal(goal), analysis: snapshotAnalysis(final, goal), changes: [] },
    });
    await refreshSavedProfiles();
  }, [profileKey, profile, goal, final]);

  useEffect(() => {
    if (!saved || !ready || !profileKey) return;
    const goalSnapshot = snapshotGoal(goal);
    const hash = evidenceHash(profile, goalSnapshot);
    if (checked.current === hash) return;
    if (saved.lastCheck?.evidenceHash === hash && Date.now() - saved.lastCheckedAt < VISIT_WINDOW_MS) return;
    const handle = setTimeout(() => {
      checked.current = hash;
      setChecking(true);
      void (async () => {
        try {
          const session = await loadProfileSession(profileKey);
          const baseline = saved.history[0]!.recordedAt;
          const { next } = await checkSavedProfile({
            saved,
            profile,
            completeSections: completeSections(session, profile),
            goal: goalSnapshot,
            analysis: snapshotAnalysis(final, goal),
            now: Date.now(),
            resolve: resolveTextPairs,
          });
          // Applied only if no other tab recorded a newer snapshot meanwhile.
          await updateSavedProfile(profileKey, (current) => (current && current.history[0]!.recordedAt === baseline ? { ...next, notes: current.notes } : current));
          await refreshSavedProfiles();
        } catch {
          // Checked again on the next settled analysis.
        } finally {
          setChecking(false);
        }
      })();
    }, CHECK_DELAY_MS);
    return () => clearTimeout(handle);
  }, [saved, ready, profileKey, profile, goal, final]);

  return { saved, checking, save };
}
