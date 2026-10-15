// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_PROFILE } from "../models/profile";
import { PROFILE_SESSION_FRESH_MS, PROFILE_SESSION_RETENTION_MS, isProfileSessionFresh, loadProfileSession, updateProfileSession } from "./profileSessionRepository";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (keys: string | string[] | null) => {
          const list = keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
          return Promise.resolve(Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])])));
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
          return Promise.resolve();
        },
      },
    },
  };
});

const evidence = (name: string) => ({ ...EMPTY_PROFILE, name, extracted: true });

describe("profileSessionRepository", () => {
  it("keeps one session per profile, so two people never share evidence", async () => {
    await updateProfileSession("jordan-rivera", { evidence: evidence("Jordan") }, 1000);
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 2000);
    expect((await loadProfileSession("jordan-rivera", 3000))?.evidence.name).toBe("Jordan");
    expect((await loadProfileSession("irev1ak1n", 3000))?.evidence.name).toBe("Illia");
    expect(await loadProfileSession("someone-else", 3000)).toBeNull();
  });

  it("tracks scanned sections and keeps the original creation time", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 1000);
    await updateProfileSession("irev1ak1n", { scannedSection: "education" }, 5000);
    const session = await loadProfileSession("irev1ak1n", 6000);
    expect(session?.scannedSections).toEqual(["education"]);
    expect(session?.createdAt).toBe(1000);
  });

  it("still returns a stale session, so its result can be shown while it is checked again", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 0);
    const stale = await loadProfileSession("irev1ak1n", PROFILE_SESSION_FRESH_MS + 1);
    expect(stale?.evidence.name).toBe("Illia");
    expect(isProfileSessionFresh(stale!, PROFILE_SESSION_FRESH_MS + 1)).toBe(false);
  });

  it("becomes fresh again once its evidence is validated, without changing it", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 0);
    const later = PROFILE_SESSION_FRESH_MS + 5000;
    const validated = await updateProfileSession("irev1ak1n", { evidence: evidence("Illia"), validated: true }, later);
    expect(validated).toMatchObject({ lastValidatedAt: later, lastEvidenceChangeAt: 0, createdAt: 0 });
    expect(isProfileSessionFresh(validated!, later + 1)).toBe(true);
  });

  it("records when the evidence last changed", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 0);
    const changed = await updateProfileSession("irev1ak1n", { evidence: evidence("Illia v2") }, 7000);
    expect(changed).toMatchObject({ lastEvidenceChangeAt: 7000, lastValidatedAt: 7000 });
  });

  it("never extends freshness for writes that neither validate nor change evidence", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 0);
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, PROFILE_SESSION_FRESH_MS - 10);
    await updateProfileSession("irev1ak1n", { scannedSection: "education" }, PROFILE_SESSION_FRESH_MS - 5);
    const session = await loadProfileSession("irev1ak1n", PROFILE_SESSION_FRESH_MS);
    expect(session?.lastValidatedAt).toBe(0);
    expect(isProfileSessionFresh(session!, PROFILE_SESSION_FRESH_MS)).toBe(false);
  });

  it("drops sessions that were not validated within the retention window", async () => {
    await updateProfileSession("jordan-rivera", { evidence: evidence("Jordan") }, 0);
    expect(await loadProfileSession("jordan-rivera", PROFILE_SESSION_RETENTION_MS)).toBeNull();
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, PROFILE_SESSION_RETENTION_MS + 1);
    expect(Object.keys(data)).toEqual(["finder.profileSession.v3:irev1ak1n"]);
  });

  it("does not create a session from a section mark alone", async () => {
    expect(await updateProfileSession("irev1ak1n", { scannedSection: "education" }, 0)).toBeNull();
  });
});

describe("updateProfileSession ordering", () => {
  it("never lets an earlier-read update write older evidence over a newer one", async () => {
    const older = { ...EMPTY_PROFILE, name: "Jordan Rivera", languages: [{ name: "English" }], extracted: true };
    const newer = { ...older, languages: [{ name: "English" }, { name: "Spanish" }] };
    await updateProfileSession("jordan", { evidence: older });
    // Issued together, as the content script does: a new section's evidence, then a validation-only touch.
    await Promise.all([updateProfileSession("jordan", { evidence: newer, scannedSection: "languages" }), updateProfileSession("jordan", { validated: true })]);
    const session = await loadProfileSession("jordan");
    expect(session?.evidence.languages.map((l) => l.name)).toEqual(["English", "Spanish"]);
    expect(session?.scannedSections).toContain("languages");
  });
});

describe("one canonical session per person", () => {
  const enriched = { ...EMPTY_PROFILE, name: "Jordan Rivera", languages: [{ name: "English" }, { name: "Spanish" }], education: [{ school: "State University" }], extracted: true };
  const shallow = { ...EMPTY_PROFILE, name: "Jordan Rivera", languages: [{ name: "English" }], extracted: true };

  it("never downgrades when a page or tab that saw less writes later", async () => {
    await updateProfileSession("jordan", { evidence: enriched });
    await updateProfileSession("jordan", { evidence: shallow, validated: true });
    const session = await loadProfileSession("jordan");
    expect(session?.evidence.languages.map((l) => l.name)).toEqual(["English", "Spanish"]);
    expect(session?.evidence.education.map((e) => e.school)).toEqual(["State University"]);
  });

  it("stores each person separately, so saving one never rewrites another", async () => {
    await updateProfileSession("jordan", { evidence: enriched });
    const before = structuredClone(data["finder.profileSession.v3:jordan"]);
    await updateProfileSession("someone-else", { evidence: { ...EMPTY_PROFILE, name: "Someone Else", extracted: true } });
    expect(data["finder.profileSession.v3:jordan"]).toEqual(before);
    expect((await loadProfileSession("someone-else"))?.evidence.languages).toEqual([]);
  });

  it("still reads a session saved in the older shared map", async () => {
    data["finder.profileSessions.v2"] = { jordan: { profileKey: "jordan", createdAt: 1, lastValidatedAt: Date.now(), lastEvidenceChangeAt: 1, evidence: enriched, scannedSections: ["main"] } };
    expect((await loadProfileSession("jordan"))?.evidence.languages).toHaveLength(2);
  });
});
