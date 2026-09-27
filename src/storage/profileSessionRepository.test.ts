// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY_PROFILE } from "../models/profile";
import { PROFILE_SESSION_TTL_MS, loadProfileSession, updateProfileSession } from "./profileSessionRepository";

let data: Record<string, unknown>;

beforeEach(() => {
  data = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { id: "test" },
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in data ? { [key]: structuredClone(data[key]) } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, structuredClone(items));
          return Promise.resolve();
        },
      },
    },
  };
});

const evidence = (name: string) => ({ ...EMPTY_PROFILE, name, extracted: true });

describe("profileSessionRepository", () => {
  it("keeps one session per profile, so two people never share evidence", async () => {
    await updateProfileSession("robert-michels", { evidence: evidence("Robert") }, 1000);
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 2000);
    expect((await loadProfileSession("robert-michels", 3000))?.evidence.name).toBe("Robert");
    expect((await loadProfileSession("irev1ak1n", 3000))?.evidence.name).toBe("Illia");
    expect(await loadProfileSession("someone-else", 3000)).toBeNull();
  });

  it("tracks scanned sections and keeps the original creation time", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 1000);
    await updateProfileSession("irev1ak1n", { scannedSection: "education" }, 5000);
    const session = await loadProfileSession("irev1ak1n", 6000);
    expect(session?.scannedSections).toEqual(["education"]);
    expect(session?.createdAt).toBe(1000);
    expect(session?.evidence.name).toBe("Illia");
  });

  it("expires 10 minutes after creation, even if it was updated since", async () => {
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, 0);
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia v2") }, PROFILE_SESSION_TTL_MS - 1000);
    expect(await loadProfileSession("irev1ak1n", PROFILE_SESSION_TTL_MS - 1)).not.toBeNull();
    expect(await loadProfileSession("irev1ak1n", PROFILE_SESSION_TTL_MS)).toBeNull();
  });

  it("starts a new session after expiry and drops expired ones from storage", async () => {
    await updateProfileSession("robert-michels", { evidence: evidence("Robert") }, 0);
    await updateProfileSession("irev1ak1n", { evidence: evidence("Illia") }, PROFILE_SESSION_TTL_MS + 1);
    const stored = data["finder.profileSessions.v1"] as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual(["irev1ak1n"]);
  });

  it("does not create a session from a section mark alone", async () => {
    expect(await updateProfileSession("irev1ak1n", { scannedSection: "education" }, 0)).toBeNull();
  });
});
