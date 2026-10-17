import type { ProfileShell } from "../linkedin/profileAdapter";

// LinkedIn renders profile sections only as they scroll into view, so readings accumulate per
// profile, and `complete` records that the whole page has been seen.
export interface ProfileShellData {
  profileKey: string;
  shell: ProfileShell;
  complete: boolean;
}

let data: ProfileShellData | null = null;
const listeners = new Set<() => void>();

export function getProfileShell(): ProfileShellData | null {
  return data;
}

export function setProfileShell(next: ProfileShellData | null): void {
  if (JSON.stringify(next) === JSON.stringify(data)) return;
  data = next;
  listeners.forEach((listener) => listener());
}

export function mergeShells(previous: ProfileShell, next: ProfileShell): ProfileShell {
  const sections = { ...previous.sections };
  for (const [name, count] of Object.entries(next.sections) as [keyof ProfileShell["sections"], number | null][]) {
    sections[name] = count ?? sections[name] ?? null;
  }
  return {
    isOwnProfile: previous.isOwnProfile || next.isOwnProfile,
    hasPhoto: previous.hasPhoto || next.hasPhoto,
    hasBanner: previous.hasBanner || next.hasBanner,
    sections,
    connections: next.connections ?? previous.connections ?? null,
    followers: next.followers ?? previous.followers ?? null,
    openToWork: next.openToWork ?? previous.openToWork ?? null,
    publicProfileSettingsUrl: next.publicProfileSettingsUrl ?? previous.publicProfileSettingsUrl ?? null,
  };
}

export function recordProfileShell(profileKey: string, shell: ProfileShell, reachedEnd: boolean): void {
  const previous = data?.profileKey === profileKey ? data : null;
  setProfileShell({
    profileKey,
    shell: previous ? mergeShells(previous.shell, shell) : shell,
    complete: (previous?.complete ?? false) || reachedEnd,
  });
}

export function subscribeProfileShell(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
