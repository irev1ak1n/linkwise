// @vitest-environment jsdom
// Coverage for content.ts's invisible-background-scan architecture (see backgroundScanProtocol.ts
// and background/backgroundScan.ts for the full design): a normal tab must never scroll itself,
// and must request/relay/cache background-scan evidence correctly; a scan tab (recognized purely
// from its URL) must never create an opener/panel and must report evidence via messaging instead
// of writing to panelStore directly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCAN_CANCEL, SCAN_FAILED, SCAN_REPORT, SCAN_REQUEST, SCAN_UPDATE } from "./backgroundScanProtocol";

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

// jsdom does not implement Element.scrollTo — scan-tab mode now genuinely calls it (see
// autoScroll.ts's doc comment on always attempting at least one real scroll), which would
// otherwise throw here even though a real browser always provides it.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = vi.fn();
}

function setProfilePage(name: string): void {
  let appRoot = document.getElementById("app-root");
  if (!appRoot) {
    appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
  }
  appRoot.innerHTML = `
    <main role="main">
      <section>
        <h1><span aria-hidden="true">${name}</span></h1>
        <div><span aria-hidden="true">Engineer</span></div>
      </section>
    </main>
  `;
}

function stubProfileUrl(href: string): void {
  vi.stubGlobal("location", { href });
}

interface FakeChromeHandle {
  sendMessage: ReturnType<typeof vi.fn>;
  onMessageListeners: Array<(message: unknown) => void>;
}

/** `hasActiveGoal: true` seeds chrome.storage.local with one already-selected goal, exactly what
 * a normal tab needs to see before it will ever request a background scan (see content.ts's
 * `tick()` — no active goal means no scan, matching the pre-existing auto-scroll gating this
 * replaces). */
function installFakeChrome(hasActiveGoal: boolean): FakeChromeHandle {
  const data: Record<string, unknown> = hasActiveGoal
    ? {
        "finder.goalsSeeded.v1": true,
        "finder.goals.v1": [{ id: "g1", name: "Test goal", criteria: [] }],
        "finder.selectedGoalId.v1": "g1",
      }
    : { "finder.goalsSeeded.v1": true, "finder.goals.v1": [] };

  const handle: FakeChromeHandle = { sendMessage: vi.fn().mockResolvedValue(undefined), onMessageListeners: [] };

  vi.stubGlobal("chrome", {
    runtime: {
      reload: vi.fn(),
      sendMessage: handle.sendMessage,
      onMessage: {
        addListener: (l: (message: unknown) => void) => handle.onMessageListeners.push(l),
        removeListener: vi.fn(),
      },
    },
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
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
  return handle;
}

describe("content.ts normal-tab background scan requests", () => {
  let fake: FakeChromeHandle;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setProfilePage("Alex Chen");
    stubProfileUrl("https://www.linkedin.com/in/alex-chen/");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("never requests a scan while no goal is active", async () => {
    fake = installFakeChrome(false);
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(fake.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: SCAN_REQUEST }));
  });

  it("requests exactly one background scan for the open profile once a goal is active, and never repeats it while the request is still in flight", async () => {
    fake = installFakeChrome(true);
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    const scanRequests = fake.sendMessage.mock.calls.filter(([m]) => (m as { type?: unknown }).type === SCAN_REQUEST);
    expect(scanRequests).toHaveLength(1);
    expect(scanRequests[0][0]).toMatchObject({ type: SCAN_REQUEST, profileKey: "alex-chen" });
  });

  it("applies a relayed SCAN_UPDATE for the currently-viewed profile to the panel", async () => {
    fake = installFakeChrome(true);
    await import("./content");
    await vi.advanceTimersByTimeAsync(500);

    const { getPanelProfileData } = await import("./panel/panelStore");
    const profile = { name: "Alex Chen", experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], extracted: true };
    const collection = { status: "settled" as const, sectionsFound: ["about" as const], sectionsDetected: ["about" as const], lastChangedAt: Date.now(), reachedDocumentEnd: true };

    for (const listener of fake.onMessageListeners) {
      listener({ type: SCAN_UPDATE, profileKey: "alex-chen", profile, collection });
    }

    expect(getPanelProfileData().profile).toEqual(profile);
    expect(getPanelProfileData().collection?.status).toBe("settled");
  });

  it("ignores a SCAN_UPDATE for a profile the user has since navigated away from", async () => {
    fake = installFakeChrome(true);
    await import("./content");
    await vi.advanceTimersByTimeAsync(500);

    const { getPanelProfileData } = await import("./panel/panelStore");
    const beforeData = getPanelProfileData();

    for (const listener of fake.onMessageListeners) {
      listener({
        type: SCAN_UPDATE,
        profileKey: "someone-else-entirely",
        profile: { extracted: true, experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [] },
        collection: { status: "settled" as const, sectionsFound: [], sectionsDetected: [], lastChangedAt: Date.now(), reachedDocumentEnd: true },
      });
    }

    expect(getPanelProfileData()).toEqual(beforeData);
  });

  it("falls back to a settled, empty result on SCAN_FAILED for the current profile rather than hanging", async () => {
    fake = installFakeChrome(true);
    await import("./content");
    await vi.advanceTimersByTimeAsync(500);

    const { getPanelProfileData } = await import("./panel/panelStore");
    for (const listener of fake.onMessageListeners) {
      listener({ type: SCAN_FAILED, profileKey: "alex-chen" });
    }

    const data = getPanelProfileData();
    expect(data.profileKey).toBe("alex-chen");
    expect(data.collection?.status).toBe("settled");
    expect(data.profile?.extracted).toBe(false);
  });

  it("reuses a cached settled result instead of requesting another scan for the same profile", async () => {
    fake = installFakeChrome(true);
    await import("./content");
    await vi.advanceTimersByTimeAsync(500);

    for (const listener of fake.onMessageListeners) {
      listener({
        type: SCAN_UPDATE,
        profileKey: "alex-chen",
        profile: { extracted: true, experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [] },
        collection: { status: "settled" as const, sectionsFound: [], sectionsDetected: [], lastChangedAt: Date.now(), reachedDocumentEnd: true },
      });
    }
    fake.sendMessage.mockClear();

    await vi.advanceTimersByTimeAsync(6000); // several more ticks, including the settled-backoff interval

    const scanRequests = fake.sendMessage.mock.calls.filter(([m]) => (m as { type?: unknown }).type === SCAN_REQUEST);
    expect(scanRequests).toHaveLength(0);
  });

  it("cancels an in-flight scan when the user navigates to a different profile", async () => {
    fake = installFakeChrome(true);
    await import("./content");
    await vi.advanceTimersByTimeAsync(500); // scan for alex-chen now in flight

    setProfilePage("Jordan Rivera");
    stubProfileUrl("https://www.linkedin.com/in/jordan-rivera/");
    await vi.advanceTimersByTimeAsync(3000); // safety-net tick notices the navigation

    const cancels = fake.sendMessage.mock.calls.filter(([m]) => (m as { type?: unknown }).type === SCAN_CANCEL);
    expect(cancels).toHaveLength(1);
    expect(cancels[0][0]).toMatchObject({ type: SCAN_CANCEL, profileKey: "alex-chen" });
  });
});

describe("content.ts scan-tab mode", () => {
  let fake: FakeChromeHandle;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setProfilePage("Alex Chen");
    stubProfileUrl("https://www.linkedin.com/in/alex-chen/?lwscan=1");
    fake = installFakeChrome(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("never creates an opener or panel host", async () => {
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(0);
    expect(document.querySelectorAll("#finder-linkwise-panel-host")).toHaveLength(0);
  });

  it("reports collected evidence back via SCAN_REPORT instead of touching panelStore UI state", async () => {
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    const reports = fake.sendMessage.mock.calls.filter(([m]) => (m as { type?: unknown }).type === SCAN_REPORT);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0][0]).toMatchObject({ type: SCAN_REPORT, profileKey: "alex-chen" });
  });

  it("never sends a SCAN_REQUEST itself, even though the same active-goal storage is reachable", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("location", { href: "https://www.linkedin.com/in/alex-chen/?lwscan=1" });
    fake = installFakeChrome(true); // a goal IS active — a scan tab must still never request its own scan
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    const scanRequests = fake.sendMessage.mock.calls.filter(([m]) => (m as { type?: unknown }).type === SCAN_REQUEST);
    expect(scanRequests).toHaveLength(0);
  });
});
