import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must match src/background/index.ts's own (unexported) constant exactly.
const DEV_RELOAD_REQUEST = "__linkwise_dev_reload__";

type Listener = (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void;

interface FakeChrome {
  onMessageListeners: Listener[];
  onInstalledListeners: Array<() => void>;
  reload: ReturnType<typeof vi.fn>;
  tabsQuery: ReturnType<typeof vi.fn>;
  executeScript: ReturnType<typeof vi.fn>;
}

function installFakeChrome(tabs: Array<{ id: number }> = []): FakeChrome {
  const fake: FakeChrome = {
    onMessageListeners: [],
    onInstalledListeners: [],
    reload: vi.fn(),
    tabsQuery: vi.fn().mockResolvedValue(tabs),
    executeScript: vi.fn().mockResolvedValue(undefined),
  };
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (listener: Listener) => {
          fake.onMessageListeners.push(listener);
        },
      },
      onInstalled: {
        addListener: (listener: () => void) => {
          fake.onInstalledListeners.push(listener);
        },
      },
      reload: fake.reload,
    },
    tabs: {
      query: fake.tabsQuery,
    },
    scripting: {
      executeScript: fake.executeScript,
    },
  };
  return fake;
}

// Regression coverage: reinjection must only run from a genuine onInstalled event, never at
// module load, since the service worker restarts on ordinary events too.
describe("background/index dev reinjection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not reinject into any tab merely from being imported/started", async () => {
    const fake = installFakeChrome([{ id: 1 }]);
    await import("./index");

    expect(fake.tabsQuery).not.toHaveBeenCalled();
    expect(fake.executeScript).not.toHaveBeenCalled();
  });

  it("reinjects into open LinkedIn tabs only once a genuine onInstalled event fires", async () => {
    const fake = installFakeChrome([{ id: 1 }, { id: 2 }]);
    await import("./index");

    expect(fake.onInstalledListeners.length).toBeGreaterThan(0);
    for (const listener of fake.onInstalledListeners) listener();
    await Promise.resolve();
    await Promise.resolve();

    expect(fake.tabsQuery).toHaveBeenCalledWith({ url: "https://*.linkedin.com/*" });
    expect(fake.executeScript).toHaveBeenCalledTimes(2);
  });

  it("still relays the dev reload request to chrome.runtime.reload()", async () => {
    const fake = installFakeChrome();
    await import("./index");

    expect(fake.onMessageListeners.length).toBeGreaterThan(0);
    for (const listener of fake.onMessageListeners) {
      listener({ type: DEV_RELOAD_REQUEST }, {}, () => {});
    }

    expect(fake.reload).toHaveBeenCalledTimes(1);
  });
});
