// @vitest-environment jsdom
// Regression coverage for the reinjection-safety mechanism: content.ts must behave correctly
// both the first time it runs on an already-open profile page, and when re-injected into a
// page that already has a (possibly orphaned) instance running — the scenario a development
// reload's automatic reinjection (see background/index.ts) produces. React is mocked out since
// this is about DOM bootstrapping/teardown, not panel rendering.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

/** Replaces only LinkedIn's own root container's content, never `document.body` itself — a
 * real SPA navigation on LinkedIn only ever re-renders its own root, leaving whatever this
 * extension has appended directly to `body` (the opener, the panel host) completely
 * untouched. Wiping `body.innerHTML` wholesale here would be a test artifact no real
 * navigation produces. */
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

function stubProfileUrl(slug: string): void {
  vi.stubGlobal("location", { href: `https://www.linkedin.com/in/${slug}/` });
}

function stubNonProfileUrl(path: string): void {
  vi.stubGlobal("location", { href: `https://www.linkedin.com${path}` });
}

/** content.ts now reads goalStore.ts directly (to gate auto-scroll on an active goal existing —
 * see autoScroll.ts), which needs a working chrome.storage.local/onChanged, not just
 * chrome.runtime. Seeded as already-seeded-with-no-goals so every test here behaves exactly as
 * before: no goal is ever active, so auto-scroll/auto-analyze simply never engages and none of
 * these bootstrap/teardown assertions are affected. */
function installFakeChromeStorage() {
  const data: Record<string, unknown> = { "finder.goalsSeeded.v1": true, "finder.goals.v1": [] };
  return {
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
  };
}

describe("content.ts bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", {
      // devTools.ts relays a dev-reload request via chrome.runtime.sendMessage — never actually
      // triggered by these bootstrap tests, but must exist or module evaluation itself throws.
      runtime: { reload: vi.fn(), sendMessage: vi.fn().mockResolvedValue(undefined) },
      storage: installFakeChromeStorage(),
    });
    setProfilePage("Jordan Rivera");
    stubProfileUrl("jordan-rivera");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("initializes cleanly on an already-open profile page: exactly one opener button", async () => {
    await import("./content");
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);
  });

  it("does not create a panel host eagerly — only once the opener is actually clicked", async () => {
    await import("./content");
    expect(document.querySelectorAll("#finder-linkwise-panel-host")).toHaveLength(0);
  });

  it("re-injecting into a page that already has a running instance never creates a duplicate opener", async () => {
    await import("./content");
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);

    // A fresh module graph sharing the same `window` and `document` — exactly what a real
    // chrome.scripting.executeScript re-injection produces (see background/index.ts).
    vi.resetModules();
    await import("./content");

    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);
  });

  it("re-injection stops the previous instance's periodic tick, rather than running two in parallel", async () => {
    await import("./content");
    const firstInstanceTimerCount = vi.getTimerCount();
    expect(firstInstanceTimerCount).toBeGreaterThan(0);

    vi.resetModules();
    await import("./content");

    // If the old instance's interval were still alive alongside the new one, this would be
    // roughly double the first instance's count instead of matching it.
    expect(vi.getTimerCount()).toBe(firstInstanceTimerCount);
  });

  it("resets collection state for a new profile after an in-page (SPA) navigation, via a re-tick rather than reinjection", async () => {
    await import("./content");
    vi.advanceTimersByTime(3000); // let the initial tick settle in on "Jordan Rivera"

    setProfilePage("Alex Chen");
    stubProfileUrl("alex-chen");
    vi.advanceTimersByTime(3000); // the periodic safety-net tick picks up the navigation

    // The opener persists (SPA navigation doesn't remove document.body's children) and is
    // still exactly one — the profile-level reset itself is covered in depth by
    // collectionEngine.test.ts's "profile navigation" suite.
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);
  });

  it("keeps the opener but clears evidence and stops scanning when navigating from a profile to a non-profile page (/feed/, /jobs/, /search/, …)", async () => {
    await import("./content");
    vi.advanceTimersByTime(3000);

    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().profileKey).toBe("jordan-rivera");

    stubNonProfileUrl("/feed/");
    // Once settled, the safety-net tick backs off to SETTLED_TICK_INTERVAL_MS (6000ms) — advance
    // past that, not just TICK_INTERVAL_MS, so the interval actually fires again and notices.
    vi.advanceTimersByTime(6000);

    expect(getPanelProfileData().profileKey).toBeNull();
    expect(getPanelProfileData().profile).toBeNull();
    // The opener is shown on every LinkedIn page now, not just profiles — it must survive.
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);
  });

  it("handles /feed/ -> /in/person/ -> /jobs/ -> /in/another-person/ with exactly one opener throughout and no evidence leaking across any hop", async () => {
    stubNonProfileUrl("/feed/");
    await import("./content");
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);

    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().profileKey).toBeNull();

    setProfilePage("Jordan Rivera");
    stubProfileUrl("jordan-rivera");
    vi.advanceTimersByTime(3000);
    expect(getPanelProfileData().profileKey).toBe("jordan-rivera");

    // Collection likely already settled during the 3000ms above (jsdom reports 0 for every
    // scroll dimension, so "near document end" is trivially true) — once settled, the
    // safety-net tick backs off to SETTLED_TICK_INTERVAL_MS (6000ms), so advance past that.
    stubNonProfileUrl("/jobs/");
    vi.advanceTimersByTime(6000);
    expect(getPanelProfileData().profileKey).toBeNull();

    setProfilePage("Alex Chen");
    stubProfileUrl("alex-chen");
    vi.advanceTimersByTime(3000);

    expect(getPanelProfileData().profileKey).toBe("alex-chen");
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);
    expect(document.querySelectorAll("#finder-linkwise-panel-host")).toHaveLength(0);
  });
});
