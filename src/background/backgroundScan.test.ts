import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCAN_CANCEL, SCAN_FAILED, SCAN_REPORT, SCAN_REQUEST, SCAN_UPDATE } from "../linkedin/backgroundScanProtocol";
import { initialCollectionState } from "../models/collection";
import { EMPTY_PROFILE } from "../models/profile";

type MessageListener = (message: { type?: unknown; [key: string]: unknown }, sender: { tab?: { id?: number } }) => boolean | void;

interface FakeChrome {
  onMessage: MessageListener[];
  onInstalled: Array<() => void>;
  onRemoved: Array<(tabId: number) => void>;
  create: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  sentTo: (tabId: number) => unknown[];
}

function installFakeChrome(nextTabId = 100): FakeChrome {
  let counter = nextTabId;
  const sendMessage = vi.fn().mockImplementation((tabId: number, message: unknown) => {
    fake.messagesByTab.set(tabId, [...(fake.messagesByTab.get(tabId) ?? []), message]);
    return Promise.resolve();
  });
  const create = vi.fn().mockImplementation(() => Promise.resolve({ id: counter++ }));
  const remove = vi.fn().mockResolvedValue(undefined);
  const query = vi.fn().mockResolvedValue([]);

  const fake: FakeChrome & { messagesByTab: Map<number, unknown[]> } = {
    onMessage: [],
    onInstalled: [],
    onRemoved: [],
    create,
    remove,
    sendMessage,
    query,
    messagesByTab: new Map(),
    sentTo: (tabId: number) => fake.messagesByTab.get(tabId) ?? [],
  };

  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      onMessage: { addListener: (l: MessageListener) => fake.onMessage.push(l) },
      onInstalled: { addListener: (l: () => void) => fake.onInstalled.push(l) },
    },
    tabs: {
      create,
      remove,
      sendMessage,
      query,
      onRemoved: { addListener: (l: (tabId: number) => void) => fake.onRemoved.push(l) },
    },
  };
  return fake;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("background/backgroundScan", () => {
  let fake: FakeChrome;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    fake = installFakeChrome();
    const { installBackgroundScan } = await import("./backgroundScan");
    installBackgroundScan();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function dispatch(message: { type: string; [key: string]: unknown }, tabId: number): void {
    for (const listener of fake.onMessage) listener(message, { tab: { id: tabId } });
  }

  it("creates one inactive scan tab per SCAN_REQUEST and relays its settled report back to the requester", async () => {
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 1);
    await flush();

    expect(fake.create).toHaveBeenCalledTimes(1);
    const [[createArgs]] = fake.create.mock.calls;
    expect(createArgs.active).toBe(false);
    expect(String(createArgs.url)).toContain("/in/alex-chen/");
    expect(String(createArgs.url)).toContain("lwscan=1");
    expect(String(createArgs.url)).toContain("lwreq=1"); // embeds the requester's own tab id

    const scanTabId = (await fake.create.mock.results[0].value).id;
    const collection = { ...initialCollectionState(0), status: "settled" as const };
    dispatch({ type: SCAN_REPORT, profileKey: "alex-chen", profile: EMPTY_PROFILE, collection, requestingTabId: 1 }, scanTabId);
    await flush();

    const relayed = fake.sentTo(1);
    expect(relayed).toHaveLength(1);
    expect(relayed[0]).toMatchObject({ type: SCAN_UPDATE, profileKey: "alex-chen", collection: { status: "settled" } });
    // Settling closes the job's tab — never left open once collection is done.
    expect(fake.remove).toHaveBeenCalledWith(scanTabId);
  });

  it("deduplicates a second request for the same profile while one is already in flight", async () => {
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 1);
    await flush();
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 2);
    await flush();

    expect(fake.create).toHaveBeenCalledTimes(1); // only one tab for the one profile

    const scanTabId = (await fake.create.mock.results[0].value).id;
    const collection = { ...initialCollectionState(0), status: "settled" as const };
    dispatch({ type: SCAN_REPORT, profileKey: "alex-chen", profile: EMPTY_PROFILE, collection, requestingTabId: 1 }, scanTabId);
    await flush();

    // Both original requesters get the result.
    expect(fake.sentTo(1)).toHaveLength(1);
    expect(fake.sentTo(2)).toHaveLength(1);
  });

  it("relays intermediate (still-collecting) reports without closing the tab", async () => {
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 1);
    await flush();
    const scanTabId = (await fake.create.mock.results[0].value).id;

    dispatch({ type: SCAN_REPORT, profileKey: "alex-chen", profile: EMPTY_PROFILE, collection: initialCollectionState(0), requestingTabId: 1 }, scanTabId);
    await flush();

    expect(fake.sentTo(1)).toHaveLength(1);
    expect(fake.sentTo(1)[0]).toMatchObject({ collection: { status: "collecting" } });
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("relays and closes correctly even when the job map has been wiped (a service-worker restart mid-scan) — the real bug this fixes", async () => {
    // Regression coverage for the actual root cause of "Match % doesn't reliably appear": a
    // confirmed-live MV3 service-worker restart between SCAN_REQUEST and a later SCAN_REPORT
    // used to wipe jobsByProfileKey, making handleScanReport treat every later report as an
    // "unknown tab" and silently drop it. Relaying now reads `requestingTabId` straight off the
    // message itself (echoed back by the scan tab from its own URL), so it must keep working
    // even with NO prior SCAN_REQUEST ever having been dispatched to this module instance at
    // all — exactly what an empty jobsByProfileKey after a restart looks like.
    const collection = { ...initialCollectionState(0), status: "settled" as const };
    dispatch({ type: SCAN_REPORT, profileKey: "alex-chen", profile: EMPTY_PROFILE, collection, requestingTabId: 1 }, 999);
    await flush();

    expect(fake.sentTo(1)).toHaveLength(1);
    expect(fake.sentTo(1)[0]).toMatchObject({ type: SCAN_UPDATE, profileKey: "alex-chen", collection: { status: "settled" } });
    // The scan tab still gets closed on settle, purely from its own tab id — no job needed.
    expect(fake.remove).toHaveBeenCalledWith(999);
  });

  it("fails the job and closes the tab if it never reports back before the timeout", async () => {
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 1);
    await flush();
    const scanTabId = (await fake.create.mock.results[0].value).id;

    await vi.advanceTimersByTimeAsync(15000);

    expect(fake.sentTo(1)).toHaveLength(1);
    expect(fake.sentTo(1)[0]).toMatchObject({ type: SCAN_FAILED, profileKey: "alex-chen" });
    expect(fake.remove).toHaveBeenCalledWith(scanTabId);
  });

  it("fails the job if the scan tab is closed unexpectedly before settling", async () => {
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 1);
    await flush();
    const scanTabId = (await fake.create.mock.results[0].value).id;

    for (const listener of fake.onRemoved) listener(scanTabId);

    expect(fake.sentTo(1)).toHaveLength(1);
    expect(fake.sentTo(1)[0]).toMatchObject({ type: SCAN_FAILED, profileKey: "alex-chen" });
  });

  it("closes the tab immediately on SCAN_CANCEL, but still relays a late report that arrives afterward (it carries its own addressing)", async () => {
    dispatch({ type: SCAN_REQUEST, profileKey: "alex-chen" }, 1);
    await flush();
    const scanTabId = (await fake.create.mock.results[0].value).id;

    dispatch({ type: SCAN_CANCEL, profileKey: "alex-chen" }, 1);
    expect(fake.remove).toHaveBeenCalledWith(scanTabId);
    fake.remove.mockClear();

    // A stale report from the now-cancelled tab still relays (it carries its own addressing —
    // see the "job map wiped" test above for why that's now unconditional) and still closes the
    // tab again — harmless, since the tab is already gone by then in the real Chrome API.
    dispatch(
      { type: SCAN_REPORT, profileKey: "alex-chen", profile: EMPTY_PROFILE, collection: { ...initialCollectionState(0), status: "settled" as const }, requestingTabId: 1 },
      scanTabId,
    );
    await flush();
    expect(fake.sentTo(1)).toHaveLength(1);
  });

  it("sweeps orphaned lwscan tabs on a genuine onInstalled event, never on ordinary startup", async () => {
    fake.query.mockResolvedValue([
      { id: 5, url: "https://www.linkedin.com/in/orphan/?lwscan=1" },
      { id: 6, url: "https://www.linkedin.com/in/someone/" },
    ]);

    expect(fake.remove).not.toHaveBeenCalled();

    for (const listener of fake.onInstalled) listener();
    await flush();

    expect(fake.remove).toHaveBeenCalledWith(5);
    expect(fake.remove).not.toHaveBeenCalledWith(6);
  });
});
