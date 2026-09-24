// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearAutoScanSession, loadAutoScanSession, saveAutoScanSession } from "./autoScanSessionRepository";
import { startAutoScanSession } from "../linkedin/autoScanSession";

function installFakeChromeStorage() {
  const data: Record<string, unknown> = {};
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: (keys: string | string[]) =>
          Promise.resolve(
            (Array.isArray(keys) ? keys : [keys]).reduce<Record<string, unknown>>((acc, key) => {
              if (key in data) acc[key] = data[key];
              return acc;
            }, {}),
          ),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
          return Promise.resolve();
        },
        remove: (key: string) => {
          delete data[key];
          return Promise.resolve();
        },
      },
    },
  };
}

describe("autoScanSessionRepository", () => {
  beforeEach(() => {
    installFakeChromeStorage();
  });

  it("round-trips a saved session for the same profileKey", async () => {
    const session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", [
      { type: "skills", heading: "Skills", url: "u1", normalizedUrl: "u1" },
    ]);
    await saveAutoScanSession(session);
    expect(await loadAutoScanSession("irev1ak1n")).toEqual(session);
  });

  it("returns null for a different profileKey than the saved session", async () => {
    const session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", []);
    await saveAutoScanSession(session);
    expect(await loadAutoScanSession("someone-else")).toBeNull();
  });

  it("returns null when nothing has been saved yet", async () => {
    expect(await loadAutoScanSession("irev1ak1n")).toBeNull();
  });

  it("clears the saved session", async () => {
    const session = startAutoScanSession("irev1ak1n", "https://www.linkedin.com/in/irev1ak1n/", []);
    await saveAutoScanSession(session);
    await clearAutoScanSession();
    expect(await loadAutoScanSession("irev1ak1n")).toBeNull();
  });
});
