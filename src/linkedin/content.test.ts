// @vitest-environment jsdom
// Regression coverage for the reinjection-safety mechanism: content.ts must behave correctly
// both on first run and when re-injected into a page with an orphaned instance already
// running. React is mocked out since this is about DOM bootstrapping, not panel rendering.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: vi.fn(), unmount: vi.fn() }),
}));

// Replaces only LinkedIn's own root container, never document.body itself, since a real SPA
// navigation never touches what this extension appended directly to body.
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

function stubDetailsPageUrl(slug: string, section: string): void {
  const href = `https://www.linkedin.com/in/${slug}/details/${section}/`;
  vi.stubGlobal("location", { href });
  // expandContent.ts's details-page recognition reads document.URL, not the stubbed location
  // above — jsdom's own document.URL is unrelated to a stubbed global location.
  Object.defineProperty(document, "URL", { value: href, configurable: true });
}

// content.ts reads goalStore.ts directly, which needs chrome.storage.local/onChanged.
// Seeded with no goals so auto-scroll never engages and these bootstrap assertions are unaffected.
function installFakeChromeStorage(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { "finder.goalsSeeded.v1": true, "finder.goals.v1": [], ...overrides };
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
    vi.stubGlobal("chrome", { runtime: { reload: vi.fn() }, storage: installFakeChromeStorage() });
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

    // A fresh module graph sharing the same window and document, exactly what a real
    // re-injection produces.
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

    // If the old interval were still alive, this would be roughly double, not matching it.
    expect(vi.getTimerCount()).toBe(firstInstanceTimerCount);
  });

  it("resets collection state for a new profile after an in-page (SPA) navigation, via a re-tick rather than reinjection", async () => {
    await import("./content");
    vi.advanceTimersByTime(3000); // let the initial tick settle in on "Jordan Rivera"

    setProfilePage("Alex Chen");
    stubProfileUrl("alex-chen");
    vi.advanceTimersByTime(3000); // the periodic safety-net tick picks up the navigation

    // The opener persists and stays exactly one. The reset itself is covered in
    // collectionEngine.test.ts's "profile navigation" suite.
    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(1);
  });

  it("keeps the opener but clears evidence and stops scanning when navigating from a profile to a non-profile page (/feed/, /jobs/, /search/, …)", async () => {
    await import("./content");
    vi.advanceTimersByTime(3000);

    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().profileKey).toBe("jordan-rivera");

    stubNonProfileUrl("/feed/");
    // Once settled, the safety-net tick backs off to SETTLED_TICK_INTERVAL_MS (6000ms),
    // so advance past that for it to fire again.
    vi.advanceTimersByTime(6000);

    expect(getPanelProfileData().profileKey).toBeNull();
    expect(getPanelProfileData().profile).toBeNull();
    // The opener is shown on every LinkedIn page now, not just profiles, it must survive.
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

    // Collection likely already settled during the 3000ms above, jsdom reports 0 for every
    // scroll dimension so "near document end" is trivially true. Advance past the backed-off tick.
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

describe("content.ts bootstrap - safe expansion gated by scan mode and the expand-details preference", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function setProfilePageWithSafeSeeMore(): { button: HTMLButtonElement } {
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `;
    return { button: document.querySelector("button")! };
  }

  it("Auto scan expands a safe profile 'see more' automatically", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    stubProfileUrl("irev1ak1n");
    const { button } = setProfilePageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(true);
  });

  it("Analyze as I scroll with the checkbox OFF (the default) never expands anything automatically", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      // "finder.scanMode.v1" and the expand-details preference are both left unset, matching
      // their real defaults ("scroll" and off).
      storage: installFakeChromeStorage(),
    });
    stubProfileUrl("irev1ak1n");
    const { button } = setProfilePageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(false);
  });

  it("Analyze as I scroll with the checkbox ON expands safe profile information", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "scroll",
        "finder.expandDetailsAutomatically.v1": true,
      }),
    });
    stubProfileUrl("irev1ak1n");
    const { button } = setProfilePageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(true);
  });

  it("Analyze as I scroll, checkbox ON or OFF, never auto-scrolls the page either way", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "scroll",
        "finder.expandDetailsAutomatically.v1": true,
        "finder.goals.v1": [{ id: "g1", name: "Test goal", criteria: [{ id: "c1", label: "Anything", importance: "PREFERRED" }] }],
      }),
    });
    stubProfileUrl("irev1ak1n");
    setProfilePageWithSafeSeeMore();
    const scrollToSpy = vi.fn();
    Element.prototype.scrollTo = scrollToSpy;

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(6000);

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  function stubOffScreen(button: HTMLButtonElement): void {
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      top: 5000,
      bottom: 5040,
      left: 0,
      right: 0,
      width: 0,
      height: 40,
      x: 0,
      y: 5000,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it("Analyze as I scroll with the checkbox ON does not expand a safe toggle that's off-screen, and never moves the page to reach it", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "scroll",
        "finder.expandDetailsAutomatically.v1": true,
      }),
    });
    stubProfileUrl("irev1ak1n");
    const { button } = setProfilePageWithSafeSeeMore();
    stubOffScreen(button);
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));
    const scrollToSpy = vi.fn();
    Element.prototype.scrollTo = scrollToSpy;

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(false);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("Auto scan expands a safe toggle even when it's off-screen, since it already drives scrolling itself", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    stubProfileUrl("irev1ak1n");
    const { button } = setProfilePageWithSafeSeeMore();
    stubOffScreen(button);
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(true);
  });

  it("Analyze as I scroll expands a toggle once it naturally becomes visible, after not expanding it while off-screen", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "scroll",
        "finder.expandDetailsAutomatically.v1": true,
      }),
    });
    stubProfileUrl("irev1ak1n");
    const { button } = setProfilePageWithSafeSeeMore();
    const rectSpy = vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      top: 5000,
      bottom: 5040,
      left: 0,
      right: 0,
      width: 0,
      height: 40,
      x: 0,
      y: 5000,
      toJSON: () => ({}),
    } as DOMRect);
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);
    expect(clicked).toBe(false); // still off-screen, must not have expanded yet

    // The user scrolls the section into view: its bounding rect now reports as on-screen.
    rectSpy.mockReturnValue({
      top: 100,
      bottom: 140,
      left: 0,
      right: 0,
      width: 0,
      height: 40,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    // Collection likely already settled during the first tick above, backing off to the
    // settled interval (SETTLED_TICK_INTERVAL_MS = 6000ms), so advance past that for it to fire.
    vi.advanceTimersByTime(6000);

    expect(clicked).toBe(true);
  });
});

describe("content.ts bootstrap - safe expansion on profile detail pages (/details/{section}/)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    Object.defineProperty(document, "URL", { value: "http://localhost/", configurable: true });
  });

  // Confirmed live: a details page has no <section> wrapper at all, unlike the main profile page.
  function setDetailsPageWithSafeSeeMore(): { button: HTMLButtonElement } {
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <h1><span aria-hidden="true">Illia Reviakin</span></h1>
        <ul><li><span aria-hidden="true">Entry</span><button type="button">more</button></li></ul>
      </main>
    `;
    return { button: document.querySelector("button")! };
  }

  it("Analyze as I scroll with the checkbox OFF never expands anything on a details page", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage(),
    });
    stubDetailsPageUrl("irev1ak1n", "education");
    const { button } = setDetailsPageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(false);
  });

  it("Analyze as I scroll with the checkbox ON expands a safe visible 'more' on a details page", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "scroll",
        "finder.expandDetailsAutomatically.v1": true,
      }),
    });
    stubDetailsPageUrl("irev1ak1n", "education");
    const { button } = setDetailsPageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(true);
  });

  it("Auto scan expands a safe 'more' on a details page too, using the same expansion engine", async () => {
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    stubDetailsPageUrl("irev1ak1n", "projects");
    const { button } = setDetailsPageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(true);
  });
});
