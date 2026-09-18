import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Must match src/background/index.ts's own (unexported) constant exactly.
const DEV_RELOAD_REQUEST = "__linkwise_dev_reload__";

type Listener = (message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void;

/** Flushes pending microtasks — reinjectIntoOpenLinkedInTabs now awaits chrome.tabs.get AND
 * chrome.scripting.executeScript sequentially per tab, so a fixed number of `Promise.resolve()`
 * flushes isn't reliably enough for more than one tab; a real macrotask tick is. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface FakeChrome {
  onMessageListeners: Listener[];
  onInstalledListeners: Array<() => void>;
  reload: ReturnType<typeof vi.fn>;
  tabsQuery: ReturnType<typeof vi.fn>;
  tabsGet: ReturnType<typeof vi.fn>;
  executeScript: ReturnType<typeof vi.fn>;
  consoleError: ReturnType<typeof vi.fn>;
}

/**
 * Tabs default to a real LinkedIn URL — reinjectIntoOpenLinkedInTabs re-checks each tab via
 * `chrome.tabs.get` right before injecting (see its own doc comment), so a fake tab needs a
 * matching `url` to be injected into at all; pass `url: undefined` explicitly to simulate one
 * that's already navigated away by the time that check runs.
 */
function installFakeChrome(tabs: Array<{ id: number; url?: string }> = []): FakeChrome {
  const tabsById = new Map(tabs.map((t) => [t.id, { id: t.id, url: t.url ?? "https://www.linkedin.com/in/someone/" }]));
  const fake: FakeChrome = {
    onMessageListeners: [],
    onInstalledListeners: [],
    reload: vi.fn(),
    tabsQuery: vi.fn().mockResolvedValue(tabs),
    tabsGet: vi.fn().mockImplementation((tabId: number) => {
      const tab = tabsById.get(tabId);
      return tab ? Promise.resolve(tab) : Promise.reject(new Error(`No tab with id: ${tabId}`));
    }),
    executeScript: vi.fn().mockResolvedValue(undefined),
    consoleError: vi.spyOn(console, "error").mockImplementation(() => {}),
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
      get: fake.tabsGet,
    },
    scripting: {
      executeScript: fake.executeScript,
    },
  };
  return fake;
}

/**
 * Regression coverage for a real, live-discovered bug: reinjection into open LinkedIn tabs must
 * only ever run from a genuine chrome.runtime.onInstalled event (real install/update/reload),
 * never unconditionally at module load — an MV3 service worker restarts on ordinary events too
 * (e.g. the AI-analysis relay message a profile view sends a few seconds in), and reinjecting on
 * every one of those wake-ups was tearing down the very panel/analysis run that had just
 * triggered the wake-up. See index.ts's doc comment on reinjectIntoOpenLinkedInTabs for the full
 * story.
 */
describe("background/index dev reinjection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    await flush();

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

  it("skips a tab that has already navigated away by the time it re-checks, without logging it as an error", async () => {
    // The tab existed when chrome.tabs.query snapshotted it, but is gone (or no longer a
    // LinkedIn tab) by the time reinjectIntoOpenLinkedInTabs re-checks it right before
    // injecting — a real, ordinary race, not a bug.
    const fake = installFakeChrome([{ id: 1, url: undefined }, { id: 2 }]);
    fake.tabsGet.mockImplementation((tabId: number) =>
      tabId === 1 ? Promise.reject(new Error("No tab with id: 1")) : Promise.resolve({ id: 2, url: "https://www.linkedin.com/in/someone/" }),
    );
    await import("./index");

    for (const listener of fake.onInstalledListeners) listener();
    await flush();

    expect(fake.executeScript).toHaveBeenCalledTimes(1); // only the still-open tab
    expect(fake.executeScript).toHaveBeenCalledWith({ target: { tabId: 2 }, files: ["content/linkedin.js"] });
    expect(fake.consoleError).not.toHaveBeenCalled();
  });

  it("does not log an expected 'frame was removed' injection race as a LinkWise error", async () => {
    const fake = installFakeChrome([{ id: 1 }]);
    fake.executeScript.mockRejectedValueOnce(new Error("Frame with ID 0 was removed."));
    await import("./index");

    for (const listener of fake.onInstalledListeners) listener();
    await flush();

    expect(fake.consoleError).not.toHaveBeenCalled();
  });

  it("still logs a genuinely unexpected injection failure as an error", async () => {
    const fake = installFakeChrome([{ id: 1 }]);
    fake.executeScript.mockRejectedValueOnce(new Error("Something else entirely broke"));
    await import("./index");

    for (const listener of fake.onInstalledListeners) listener();
    await flush();

    expect(fake.consoleError).toHaveBeenCalledTimes(1);
  });
});
