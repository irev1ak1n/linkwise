import { describe, expect, it } from "vitest";
import { createCollectionEngine } from "./collectionEngine";
import type { LinkedInProfile, ProfileSectionName } from "../models/profile";

function profile(overrides: Partial<LinkedInProfile>): LinkedInProfile {
  return {
    experience: [],
    education: [],
    skills: [],
    projects: [],
    certifications: [],
    organizations: [],
    volunteering: [],
    languages: [],
    extracted: true,
    ...overrides,
  };
}

// A controllable fake clock/extractor/scroll harness for deterministic testing. detected
// mirrors the fake profile's content by default, call setDetected to simulate a heading
// visible before its content loads.
function createHarness(initialKey: string | null, options: { hasEnoughEvidence?: (p: LinkedInProfile) => boolean } = {}) {
  let clock = 0;
  let key = initialKey;
  let extracted: LinkedInProfile = profile({});
  let detected: ProfileSectionName[] | null = null;
  let nearEnd = false;
  const updates: { profileKey: string; profile: LinkedInProfile; status: string; sectionsDetected: ProfileSectionName[] }[] = [];
  const resets: string[] = [];
  let leaveCount = 0;

  function impliedDetected(p: LinkedInProfile): ProfileSectionName[] {
    const found: ProfileSectionName[] = [];
    if (p.about) found.push("about");
    if (p.experience.length > 0) found.push("experience");
    if (p.education.length > 0) found.push("education");
    if (p.skills.length > 0) found.push("skills");
    if (p.projects.length > 0) found.push("projects");
    return found;
  }

  const engine = createCollectionEngine({
    now: () => clock,
    extractProfile: () => extracted,
    detectSections: () => detected ?? impliedDetected(extracted),
    getProfileKey: () => key,
    isNearDocumentEnd: () => nearEnd,
    hasEnoughEvidence: options.hasEnoughEvidence,
    onUpdate: (profileKey, p, collection) =>
      updates.push({ profileKey, profile: p, status: collection.status, sectionsDetected: collection.sectionsDetected }),
    onReset: (profileKey) => resets.push(profileKey),
    onLeaveProfile: () => {
      leaveCount += 1;
    },
  });

  return {
    engine,
    advance: (ms: number) => {
      clock += ms;
    },
    setKey: (k: string | null) => {
      key = k;
    },
    setExtracted: (p: LinkedInProfile) => {
      extracted = p;
    },
    setDetected: (sections: ProfileSectionName[] | null) => {
      detected = sections;
    },
    setNearEnd: (v: boolean) => {
      nearEnd = v;
    },
    updates,
    resets,
    getLeaveCount: () => leaveCount,
  };
}

describe("createCollectionEngine - basic accumulation", () => {
  it("reports an update the first time a profile is read", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].profileKey).toBe("alice");
  });

  it("does not report a duplicate update when nothing changed", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    h.engine.tick();
    h.engine.tick();
    expect(h.updates).toHaveLength(1);
  });

  it("reports a new update each time more content is found (natural DOM growth from scrolling)", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "I build things." }));
    h.engine.tick();
    h.setExtracted(profile({ about: "I build things.", skills: ["Python"] }));
    h.engine.tick();
    expect(h.updates).toHaveLength(2);
    expect(h.updates[1].profile.skills).toEqual(["Python"]);
  });

  it("never marks status settled while content is still changing, no matter how much time passes", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    h.setNearEnd(true);
    h.advance(100_000); // a long time, but content is about to change again
    h.setExtracted(profile({ about: "Engineer", skills: ["Python"] }));
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");
  });
});

describe("createCollectionEngine - progressive section discovery", () => {
  it("reports sectionsFound growing as more content loads", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "About text" }));
    h.engine.tick();
    expect(h.engine.getCollectionState().sectionsFound).toEqual(["about"]);

    h.setExtracted(profile({ about: "About text", experience: [{ title: "Engineer" }] }));
    h.engine.tick();
    expect(h.engine.getCollectionState().sectionsFound).toEqual(["about", "experience"]);
  });

  it("detects a section's heading before its content has loaded, growing the denominator ahead of the numerator", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "About text" }));
    h.setDetected(["about", "skills"]); // "Skills" heading is visible, content not rendered yet
    h.engine.tick();

    const state = h.engine.getCollectionState();
    expect(state.sectionsFound).toEqual(["about"]);
    expect(state.sectionsDetected).toEqual(["about", "skills"]);
  });

  it("increases the denominator when scrolling reveals a previously-undetected section, per the mission's 2/3 -> 4/5 example", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "About", experience: [{ title: "Role" }] }));
    h.setDetected(["about", "experience"]);
    h.engine.tick();
    let state = h.engine.getCollectionState();
    expect(state.sectionsFound).toHaveLength(2);
    expect(state.sectionsDetected).toHaveLength(2);

    h.setExtracted(
      profile({
        about: "About",
        experience: [{ title: "Role" }],
        education: [{ school: "State University" }],
        skills: ["Python"],
      }),
    );
    h.setDetected(["about", "experience", "education", "skills", "projects"]);
    h.engine.tick();
    state = h.engine.getCollectionState();
    expect(state.sectionsFound).toHaveLength(4);
    expect(state.sectionsDetected).toHaveLength(5);
  });

  it("never assumes a fixed total — a profile with only one discoverable section reports 1, not a padded default", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Just an about section, nothing else on this sparse profile." }));
    h.setDetected(["about"]);
    h.engine.tick();
    expect(h.engine.getCollectionState().sectionsDetected).toEqual(["about"]);
  });
});

describe("createCollectionEngine - settling", () => {
  it("settles only once BOTH a quiet period has passed AND the document end was reached", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");

    h.advance(3000); // quiet period alone
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting"); // never reached the end

    h.setNearEnd(true);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");
  });

  it("never settles from a fixed timer alone while the document end has never been reached", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    h.advance(1_000_000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");
  });

  it("never settles merely because the document end was reached, without a quiet period", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.setNearEnd(true);
    h.engine.tick(); // reaches end on the very first tick, zero quiet time elapsed
    expect(h.engine.getCollectionState().status).toBe("collecting");
  });

  it("remembers having reached the document end even if the user scrolls back up", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.setNearEnd(true);
    h.engine.tick();
    h.setNearEnd(false); // scrolled back up
    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");
  });

  it("settles a sparse profile (a single short section) instead of leaving it stuck forever", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "A short bio, nothing else on this profile." }));
    h.setDetected(["about"]);
    h.setNearEnd(true);
    h.engine.tick();
    h.advance(3000);
    h.engine.tick();

    const state = h.engine.getCollectionState();
    expect(state.status).toBe("settled");
    expect(state.sectionsFound).toEqual(["about"]);
    expect(state.sectionsDetected).toEqual(["about"]);
  });
});

describe("createCollectionEngine - hasEnoughEvidence (analyze-as-I-scroll mode)", () => {
  it("settles once enough evidence exists and the quiet period passes, without ever reaching the document end", () => {
    const h = createHarness("alice", { hasEnoughEvidence: (p) => Boolean(p.about) });
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");

    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");
    expect(h.engine.getCollectionState().reachedDocumentEnd).toBe(false);
  });

  it("still requires the quiet period even when there's already enough evidence", () => {
    const h = createHarness("alice", { hasEnoughEvidence: () => true });
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");
  });

  it("re-enters collecting and settles again once genuinely new evidence appears after an early settle", () => {
    const h = createHarness("alice", { hasEnoughEvidence: (p) => Boolean(p.about) });
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");

    h.setExtracted(profile({ about: "Engineer", skills: ["Python"] }));
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");

    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");
    expect(h.engine.getCollectionState().sectionsFound).toContain("skills");
  });

  it("does not settle early when hasEnoughEvidence is omitted, matching the original auto-scan behavior", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Engineer" }));
    h.engine.tick();
    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("collecting");
  });
});

describe("createCollectionEngine - profile navigation", () => {
  it("resets collection state when the profile identity changes", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "About Alice" }));
    h.setNearEnd(true);
    h.engine.tick();
    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");

    h.setKey("bob");
    h.setExtracted(profile({ about: "About Bob" }));
    h.engine.tick();

    expect(h.resets).toEqual(["alice", "bob"]); // "alice" was the very first profile ever seen, also a reset from nothing
    expect(h.engine.getCollectionState().status).toBe("collecting");
    expect(h.engine.getCollectionState().sectionsFound).toEqual(["about"]);
  });

  it("never mixes evidence from two different profiles", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ headline: "Alice", about: "Alice's about section" }));
    h.engine.tick();

    h.setKey("bob");
    h.setExtracted(profile({ headline: "Bob" }));
    h.engine.tick();

    const lastUpdate = h.updates[h.updates.length - 1];
    expect(lastUpdate.profile.about).toBeUndefined();
    expect(lastUpdate.profile.headline).toBe("Bob");
  });

  it("does not carry sectionsDetected/sectionsFound over to the new profile (SPA navigation reset)", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "Alice", experience: [{ title: "Role" }], skills: ["Python"] }));
    h.setDetected(["about", "experience", "skills", "projects"]);
    h.engine.tick();
    expect(h.engine.getCollectionState().sectionsDetected).toHaveLength(4);

    h.setKey("bob");
    h.setExtracted(profile({ about: "Bob's about" }));
    h.setDetected(["about"]);
    h.engine.tick();

    const state = h.engine.getCollectionState();
    expect(state.sectionsFound).toEqual(["about"]);
    expect(state.sectionsDetected).toEqual(["about"]);
  });

  it("does nothing on a page with no supported profile at all — no profile was ever entered, so there's nothing to leave", () => {
    const h = createHarness(null);
    h.engine.tick();

    expect(h.engine.getProfileKey()).toBeNull();
    expect(h.resets).toEqual([]);
    expect(h.getLeaveCount()).toBe(0);
  });
});

describe("createCollectionEngine - leaving a profile", () => {
  it("stops and clears collection state when navigating away from a profile to a non-profile page", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "About Alice", experience: [{ title: "Role" }] }));
    h.engine.tick();
    expect(h.engine.getCollectionState().sectionsFound.length).toBeGreaterThan(0);

    h.setKey(null); // navigated to /feed/, /jobs/, /search/, …
    h.engine.tick();

    expect(h.engine.getProfileKey()).toBeNull();
    expect(h.engine.getCollectionState().sectionsFound).toEqual([]);
    expect(h.engine.getCollectionState().sectionsDetected).toEqual([]);
    expect(h.getLeaveCount()).toBe(1);
  });

  it("fires onLeaveProfile exactly once, not repeatedly, while sitting on non-profile pages", () => {
    const h = createHarness("alice");
    h.engine.tick();

    h.setKey(null);
    h.engine.tick();
    h.engine.tick();
    h.engine.tick();

    expect(h.getLeaveCount()).toBe(1);
  });

  it("starts a genuinely fresh scan when returning to the same profile after leaving it", () => {
    const h = createHarness("alice");
    h.setExtracted(profile({ about: "About Alice" }));
    h.setNearEnd(true);
    h.engine.tick();
    h.advance(3000);
    h.engine.tick();
    expect(h.engine.getCollectionState().status).toBe("settled");

    h.setKey(null);
    h.engine.tick();

    h.setNearEnd(false); // the new visit starts scrolled back to the top
    h.setKey("alice");
    h.setExtracted(profile({}));
    h.engine.tick();

    const state = h.engine.getCollectionState();
    expect(state.status).toBe("collecting");
    expect(state.reachedDocumentEnd).toBe(false);
    expect(h.resets).toEqual(["alice", "alice"]); // entered "alice" twice, once per visit
  });

  it("handles /feed/ -> /in/person/ -> /jobs/ -> /in/another-person/ with no evidence leaking across any hop", () => {
    const h = createHarness(null); // starts on a non-profile page

    h.engine.tick(); // still /feed/ — nothing to do
    expect(h.getLeaveCount()).toBe(0);

    h.setKey("person");
    h.setExtracted(profile({ about: "About Person" }));
    h.engine.tick();
    expect(h.engine.getCollectionState().sectionsFound).toEqual(["about"]);

    h.setKey(null); // -> /jobs/
    h.engine.tick();
    expect(h.getLeaveCount()).toBe(1);
    expect(h.engine.getCollectionState().sectionsFound).toEqual([]);

    h.setKey("another-person");
    h.setExtracted(profile({ about: "About Someone Else" }));
    h.engine.tick();

    const lastUpdate = h.updates[h.updates.length - 1];
    expect(lastUpdate.profileKey).toBe("another-person");
    expect(lastUpdate.profile.about).toBe("About Someone Else");
  });
});

describe("createCollectionEngine - determinism", () => {
  it("produces the same sequence of updates for the same sequence of inputs", () => {
    function run() {
      const h = createHarness("alice");
      h.setExtracted(profile({ about: "About text." }));
      h.engine.tick();
      h.setExtracted(profile({ about: "About text.", skills: ["Python"] }));
      h.engine.tick();
      h.setNearEnd(true);
      h.advance(3000);
      h.engine.tick();
      return h.updates.map((u) => ({ status: u.status, about: u.profile.about, skills: u.profile.skills }));
    }
    expect(run()).toEqual(run());
  });
});
