import { afterEach, describe, expect, it } from "vitest";
import { getProfileShell, mergeShells, recordProfileShell, setProfileShell } from "./profileShellStore";

const top = { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: { about: null } };
const lower = { isOwnProfile: false, hasPhoto: false, hasBanner: false, sections: { experience: null, skills: 50 } };

afterEach(() => setProfileShell(null));

describe("profile shell readings", () => {
  it("keeps sections seen earlier while the page scrolls", () => {
    expect(mergeShells(top, lower)).toEqual({ isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: { about: null, experience: null, skills: 50 } });
  });

  it("accumulates per profile and stays complete once the end was seen", () => {
    recordProfileShell("me", top, false);
    recordProfileShell("me", lower, true);
    recordProfileShell("me", top, false);
    expect(getProfileShell()).toMatchObject({ profileKey: "me", complete: true, shell: { sections: { about: null, skills: 50 } } });
    recordProfileShell("other", lower, false);
    expect(getProfileShell()).toMatchObject({ profileKey: "other", complete: false, shell: lower });
  });
});
