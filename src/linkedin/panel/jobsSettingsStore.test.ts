// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_JOBS_SETTINGS } from "../../models/jobsSettings";

function installControllableChromeStorage() {
  const data: Record<string, unknown> = {};
  const pendingGets: (() => void)[] = [];
  let onChangedListener: ((changes: Record<string, unknown>, area: string) => void) | null = null;

  vi.stubGlobal("chrome", {
    runtime: { id: "test-extension-id" },
    storage: {
      local: {
        get: (keys: string | string[]) =>
          new Promise((resolve) => {
            const snapshot = { ...data };
            pendingGets.push(() => {
              resolve(
                (Array.isArray(keys) ? keys : [keys]).reduce<Record<string, unknown>>((acc, key) => {
                  if (key in snapshot) acc[key] = snapshot[key];
                  return acc;
                }, {}),
              );
            });
          }),
        set: (items: Record<string, unknown>) => {
          Object.assign(data, items);
          return Promise.resolve();
        },
      },
      onChanged: {
        addListener: (fn: (changes: Record<string, unknown>, area: string) => void) => {
          onChangedListener = fn;
        },
        removeListener: () => {},
      },
    },
  });

  return {
    resolveNextGet: () => pendingGets.shift()?.(),
    triggerStorageChange: () => onChangedListener?.({ "finder.jobsSettings.v1": {} }, "local"),
  };
}

describe("jobsSettingsStore - stale storage-echo race", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does not let a stale storage refresh overwrite a newer local edit", async () => {
    const { resolveNextGet, triggerStorageChange } = installControllableChromeStorage();
    const { initJobsSettingsStore, setJobsSettings, getJobsSettingsState } = await import("./jobsSettingsStore");

    initJobsSettingsStore();
    resolveNextGet();
    await Promise.resolve();

    setJobsSettings({ ...DEFAULT_JOBS_SETTINGS, keywordsText: "D" });
    triggerStorageChange(); // echo of the "D" write, its own get() call captures "D"

    setJobsSettings({ ...DEFAULT_JOBS_SETTINGS, keywordsText: "De" });

    resolveNextGet(); // the stale "D" read finally resolves, after "De" was already set locally
    await Promise.resolve();
    await Promise.resolve();

    expect(getJobsSettingsState().settings.keywordsText).toBe("De");
  });

  it("still applies a genuinely newer external change when no local write raced it", async () => {
    const { resolveNextGet, triggerStorageChange } = installControllableChromeStorage();
    const { initJobsSettingsStore, getJobsSettingsState } = await import("./jobsSettingsStore");

    initJobsSettingsStore();
    resolveNextGet();
    await Promise.resolve();

    triggerStorageChange();
    resolveNextGet();
    await Promise.resolve();
    await Promise.resolve();

    expect(getJobsSettingsState().loaded).toBe(true);
  });
});
