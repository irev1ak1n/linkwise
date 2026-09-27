// @vitest-environment jsdom
// Regression coverage for the reinjection-safety mechanism: content.ts must behave correctly
// both on first run and when re-injected into a page with an orphaned instance already
// running. React is mocked out since this is about DOM bootstrapping, not panel rendering.
import type { LinkedInProfile } from "../models/profile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The first test pays for compiling the whole content-script module graph.
vi.setConfig({ testTimeout: 15000 });

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

// A location stub whose assign() actually moves href (and document.URL, which expandContent.ts
// reads separately), so the crawler's own real navigation calls are observable in a test.
function stubNavigableLocation(initialHref: string): { assign: ReturnType<typeof vi.fn> } {
  let href = initialHref;
  const assign = vi.fn((url: string) => {
    href = url;
    Object.defineProperty(document, "URL", { value: href, configurable: true });
  });
  vi.stubGlobal("location", {
    get href() {
      return href;
    },
    assign,
  });
  Object.defineProperty(document, "URL", { value: href, configurable: true });
  return { assign };
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

// jsdom lays nothing out, so every element reports 0 for its scroll dimensions. A rendered
// LinkedIn profile is taller than the window, scrolled to its end here.
function stubRenderedPageHeight(): () => void {
  const props = { scrollHeight: 3000, clientHeight: 800, scrollTop: 2200 };
  for (const [name, value] of Object.entries(props)) {
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value, set: () => {} });
  }
  return () => {
    for (const name of Object.keys(props)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  };
}

describe("content.ts bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn() }, storage: installFakeChromeStorage() });
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

  it("reopens the panel after a reload if it was open in this tab", async () => {
    sessionStorage.setItem("linkwise.panelOpen", "1");
    await import("./content");
    expect(document.getElementById("finder-linkwise-panel-host")?.style.display).toBe("block");
    sessionStorage.clear();
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

  it("removes its opener and stops ticking once its extension context is invalidated", async () => {
    await import("./content");
    (globalThis.chrome as { runtime: { id?: string } }).runtime.id = undefined;
    await vi.advanceTimersByTimeAsync(3500);

    expect(document.querySelectorAll("#finder-linkwise-opener")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
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
    await vi.advanceTimersByTimeAsync(3000);
    expect(getPanelProfileData().profileKey).toBe("jordan-rivera");

    // Collection likely already settled during the 3000ms above, jsdom reports 0 for every
    // scroll dimension so "near document end" is trivially true. Advance past the backed-off tick.
    stubNonProfileUrl("/jobs/");
    await vi.advanceTimersByTimeAsync(6000);
    expect(getPanelProfileData().profileKey).toBeNull();

    setProfilePage("Alex Chen");
    stubProfileUrl("alex-chen");
    await vi.advanceTimersByTimeAsync(3000);

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
      runtime: { id: "test", reload: vi.fn() },
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
      runtime: { id: "test", reload: vi.fn() },
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
      runtime: { id: "test", reload: vi.fn() },
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

  it("Auto scan moves down one screen at a time so lazily rendered sections load", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.goals.v1": [{ id: "g1", name: "Test goal", criteria: [{ id: "c1", label: "Anything", importance: "PREFERRED" }] }],
      }),
    });
    stubProfileUrl("irev1ak1n");
    setProfilePageWithSafeSeeMore();
    const sizes = { scrollHeight: 5000, clientHeight: 800, scrollTop: 0 };
    for (const [name, value] of Object.entries(sizes)) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value, set: () => {} });
    const scrollBy = vi.fn();
    const scrollTo = vi.fn();
    Element.prototype.scrollBy = scrollBy;
    Element.prototype.scrollTo = scrollTo;

    try {
      await import("./content");
      await vi.advanceTimersByTimeAsync(3000);
      expect(scrollBy).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });
      expect(scrollTo).not.toHaveBeenCalledWith(expect.objectContaining({ top: 5000 }));
    } finally {
      for (const name of Object.keys(sizes)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  it("Analyze as I scroll, checkbox ON or OFF, never auto-scrolls the page either way", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
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
    Element.prototype.scrollBy = scrollToSpy;

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
      runtime: { id: "test", reload: vi.fn() },
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
    Element.prototype.scrollBy = scrollToSpy;

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(3000);

    expect(clicked).toBe(false);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it("Auto scan expands a safe toggle even when it's off-screen, since it already drives scrolling itself", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
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
      runtime: { id: "test", reload: vi.fn() },
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
      runtime: { id: "test", reload: vi.fn() },
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
      runtime: { id: "test", reload: vi.fn() },
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

  it.each([
    ["on by default", {}, true],
    ["off when the Auto scan preference is off", { "finder.autoScanExpandDetails.v1": false }, false],
  ])("Auto scan expands a safe 'more' on a manually opened details page (%s)", async (_label, prefs, expected) => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", ...prefs }),
    });
    stubDetailsPageUrl("irev1ak1n", "education");
    const { button } = setDetailsPageWithSafeSeeMore();
    let clicked = false;
    button.addEventListener("click", () => (clicked = true));

    await import("./content");
    await vi.advanceTimersByTimeAsync(8000);

    expect(clicked).toBe(expected);
  });
});

describe("content.ts bootstrap - Auto scan checklist crawler", () => {
  let restoreHeight = () => {};
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    restoreHeight = stubRenderedPageHeight();
  });

  afterEach(() => {
    restoreHeight();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    Object.defineProperty(document, "URL", { value: "http://localhost/", configurable: true });
  });

  function setMainProfilePage(): void {
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
        <section>
          <h2>Experience</h2>
          <a href="/in/irev1ak1n/details/experience/">Show all</a>
        </section>
        <section>
          <h2>Education</h2>
          <a href="/in/irev1ak1n/details/education/">Show all</a>
        </section>
      </main>
    `;
  }

  function setDetailsPage(heading: string, itemText: string): void {
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <h1><span aria-hidden="true">Illia Reviakin</span></h1>
        <ul><li><span aria-hidden="true">${itemText}</span></li></ul>
      </main>
    `;
    void heading; // kept for readability at call sites, the fixture itself is heading-agnostic
  }

  it("starts a crawl once the main page is fully covered, and navigates to the first section", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.enhancedAnalysis.v1": true }),
    });
    setMainProfilePage();

    await import("./content");
    // The Async variant flushes microtasks between timer firings, needed here since loading
    // the (nonexistent) saved session and evidence is itself async.
    await vi.advanceTimersByTimeAsync(6000);

    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/experience/");
  });

  it("retries discovery instead of locking in an empty queue when the main page settles before its 'Show all' links render", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.enhancedAnalysis.v1": true }),
    });
    // No "/details/" links yet, matching a real, slow LinkedIn client-side render where the
    // page otherwise looks settled before these links exist in the DOM.
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
      </main>
    `;

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000); // well past settle, still under DISCOVERY_SETTLE_MS

    expect(assign).not.toHaveBeenCalled();

    const main = document.querySelector("main")!;
    main.innerHTML += `
      <section>
        <h2>Experience</h2>
        <a href="/in/irev1ak1n/details/experience/">Show all</a>
      </section>
    `;
    await vi.advanceTimersByTimeAsync(6000); // past DISCOVERY_SETTLE_MS if it hadn't already retried

    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/experience/");
  });

  it("never queues a Skills detail page, but still collects Skills evidence from the main page itself", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.enhancedAnalysis.v1": true }),
    });
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
        <section>
          <h2>Experience</h2>
          <a href="/in/irev1ak1n/details/experience/">Show all</a>
        </section>
        <section>
          <h2>Skills</h2>
          <ul><li><span aria-hidden="true">Python</span></li></ul>
          <a href="/in/irev1ak1n/details/skills/">Show all</a>
        </section>
      </main>
    `;

    await import("./content");
    await vi.advanceTimersByTimeAsync(6000);

    // Never navigates into Skills, only ever the Experience section.
    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/experience/");
    expect(assign).not.toHaveBeenCalledWith(expect.stringContaining("/details/skills/"));

    const { getPanelProfileData } = await import("./panel/panelStore");
    const progress = getPanelProfileData().autoScanProgress;
    expect(progress?.sections.map((s) => s.heading)).not.toContain("Skills");
    expect(getPanelProfileData().profile?.skills).toContain("Python"); // still collected from the main page
  });

  it("never queues Interests, and still reaches a complete scan rather than treating it as a failure", async () => {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.enhancedAnalysis.v1": true }),
    });
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
        <section><h2>About</h2><span aria-hidden="true">A short bio.</span></section>
        <section><h2>Interests</h2><a href="/in/irev1ak1n/details/interests/">Show all</a></section>
      </main>
    `;

    await import("./content");
    await vi.advanceTimersByTimeAsync(6000);

    const { getPanelProfileData } = await import("./panel/panelStore");
    const progress = getPanelProfileData().autoScanProgress;
    // No sections were queueable at all (only Interests was discovered, and it's excluded), so
    // the scan completes immediately rather than hanging or failing.
    expect(progress?.status).toBe("complete");
    expect(progress?.sections).toEqual([]);
  });

  it("visits a queued section, collects it, and moves directly to the next one", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/experience/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.enhancedAnalysis.v1": true,
        "finder.autoScanSession.v1": {
          sessionId: "s1",
          profileKey: "irev1ak1n",
          originalProfileUrl: "https://www.linkedin.com/in/irev1ak1n/",
          currentIndex: 0,
          status: "scanning",
          startedAt: Date.now(),
          sections: [
            {
              type: "experience",
              heading: "Experience",
              url: "/in/irev1ak1n/details/experience/",
              normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/experience/",
              status: "pending",
              attempts: 0,
            },
            {
              type: "education",
              heading: "Education",
              url: "/in/irev1ak1n/details/education/",
              normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/education/",
              status: "pending",
              attempts: 0,
            },
          ],
        },
      }),
    });
    setDetailsPage("Experience", "Software Engineer at Acme");

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000); // load session, mark scanning
    await vi.advanceTimersByTimeAsync(3000); // past the settle window, extract + merge + mark done

    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/education/");

    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().autoScanProgress?.sections[0].status).toBe("done");
  });

  it("a section that never renders anything readable times out, gets one retry, then is marked failed and the scan moves on", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.enhancedAnalysis.v1": true,
        "finder.autoScanSession.v1": {
          sessionId: "s2",
          profileKey: "irev1ak1n",
          originalProfileUrl: "https://www.linkedin.com/in/irev1ak1n/",
          currentIndex: 0,
          status: "scanning",
          startedAt: Date.now(),
          sections: [
            {
              type: "education",
              heading: "Education",
              url: "/in/irev1ak1n/details/education/",
              normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/education/",
              status: "pending",
              attempts: 0,
            },
            {
              type: "honors",
              heading: "Honors",
              url: "/in/irev1ak1n/details/honors/",
              normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/honors/",
              status: "pending",
              attempts: 0,
            },
          ],
        },
      }),
    });
    // No name/headline at all — extractLinkedInProfile never reports extracted: true, so this
    // details page can never settle, exactly like a broken/never-loading LinkedIn page.
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `<main role="main"></main>`;

    await import("./content");
    const { getPanelProfileData } = await import("./panel/panelStore");

    // Advance in small steps rather than one long jump, and stop the instant the first retry
    // (attempts: 1, back to pending) is observed, so this doesn't depend on exact timing math.
    let sawFirstRetry = false;
    for (let elapsed = 0; elapsed < 25000 && !sawFirstRetry; elapsed += 500) {
      await vi.advanceTimersByTimeAsync(500);
      const section = getPanelProfileData().autoScanProgress?.sections[0];
      if (section?.status === "pending" && elapsed > 4000) sawFirstRetry = true; // past the first mark-scanning
    }
    expect(sawFirstRetry).toBe(true);
    expect(assign).not.toHaveBeenCalled(); // the retry happens in place, no navigation yet

    // Same section, second failure: retry limit reached, marks failed, moves on to Honors.
    let sawFailure = false;
    for (let elapsed = 0; elapsed < 25000 && !sawFailure; elapsed += 500) {
      await vi.advanceTimersByTimeAsync(500);
      if (getPanelProfileData().autoScanProgress?.sections[0].status === "failed") sawFailure = true;
    }
    expect(sawFailure).toBe(true);
    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/honors/"); // scan continues
  });

  it("recovers an in-progress session after a fresh content script injection, without restarting the queue", async () => {
    const savedSession = {
      sessionId: "recover-1",
      profileKey: "irev1ak1n",
      originalProfileUrl: "https://www.linkedin.com/in/irev1ak1n/",
      currentIndex: 1,
      status: "scanning",
      startedAt: Date.now(),
      sections: [
        {
          type: "experience",
          heading: "Experience",
          url: "/in/irev1ak1n/details/experience/",
          normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/experience/",
          status: "done",
          attempts: 0,
        },
        {
          type: "education",
          heading: "Education",
          url: "/in/irev1ak1n/details/education/",
          normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/education/",
          status: "pending",
          attempts: 0,
        },
      ],
    };
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.autoScanSession.v1": savedSession,
      }),
    });
    setDetailsPage("Education", "State University");

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();

    const { getPanelProfileData } = await import("./panel/panelStore");
    const progress = getPanelProfileData().autoScanProgress;
    expect(progress?.sessionId).toBe("recover-1");
    expect(progress?.sections[0].status).toBe("done"); // Experience never reopens
    expect(progress?.currentIndex).toBe(1); // resumed at Education, not restarted
  });

  it.each([
    ["Enhanced analysis off", {}],
    ["Enhanced analysis on", { "finder.enhancedAnalysis.v1": true }],
  ])("never redirects or starts a crawl from a manually opened details page (%s)", async (_label, prefs) => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/experience/");
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "auto", ...prefs });
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn() }, storage });
    setDetailsPage("Experience", "Software Engineer at Acme");

    await import("./content");
    await vi.advanceTimersByTimeAsync(20000);

    expect(assign).not.toHaveBeenCalled();
    expect((await storage.local.get("finder.autoScanSession.v1"))["finder.autoScanSession.v1"]).toBeUndefined();
    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().autoScanProgress ?? null).toBeNull();
  });

  it("leaves a manually opened section alone during an active crawl instead of pulling the user back", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/projects/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.enhancedAnalysis.v1": true,
        "finder.autoScanSession.v1": {
          sessionId: "active-1",
          profileKey: "irev1ak1n",
          originalProfileUrl: "https://www.linkedin.com/in/irev1ak1n/",
          currentIndex: 0,
          status: "scanning",
          startedAt: Date.now(),
          sections: [
            {
              type: "education",
              heading: "Education",
              url: "/in/irev1ak1n/details/education/",
              normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/education/",
              status: "pending",
              attempts: 0,
            },
          ],
        },
      }),
    });
    setDetailsPage("Projects", "Robot arm");

    await import("./content");
    await vi.advanceTimersByTimeAsync(20000);

    expect(assign).not.toHaveBeenCalled();
  });

  it("once complete, returns to the original profile and never restarts the crawl", async () => {
    const completeSession = {
      sessionId: "done-1",
      profileKey: "irev1ak1n",
      originalProfileUrl: "https://www.linkedin.com/in/irev1ak1n/",
      currentIndex: 1,
      status: "complete",
      startedAt: Date.now(),
      sections: [
        {
          type: "experience",
          heading: "Experience",
          url: "/in/irev1ak1n/details/experience/",
          normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/experience/",
          status: "done",
          attempts: 0,
        },
      ],
    };
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.autoScanSession.v1": completeSession,
      }),
    });
    setMainProfilePage();

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(6000);

    // Already home and already complete — no navigation anywhere, no rediscovery.
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("content.ts bootstrap - sections the user opens in Auto scan", () => {
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

  const mainEvidence = {
    ...{ experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] },
    name: "Illia Reviakin",
    headline: "Student Developer",
    about: "Builds websites.",
    experience: [{ title: "Web Lead", company: "Robotics Club", description: "Led a 4-person web team" }],
    extracted: true,
  };

  function setEducationPage(school = "State University"): void {
    document.body.innerHTML = `
      <div id="app-root"><main role="main">
        <h1><span aria-hidden="true">Illia Reviakin</span></h1>
        <section><h2>Education</h2><ul><li><p>${school}</p><p>BS Computer Science</p></li></ul></section>
      </main></div>
    `;
  }

  function sessionFor(profileKey: string) {
    return { [profileKey]: { profileKey, createdAt: Date.now(), updatedAt: Date.now(), evidence: mainEvidence, scannedSections: [] } };
  }

  async function openEducation(prefs: Record<string, unknown>, stored: unknown = sessionFor("irev1ak1n")) {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v1": stored, ...prefs });
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn() }, storage });
    setEducationPage();
    await import("./content");
    await vi.advanceTimersByTimeAsync(8000);
    const { getPanelProfileData, subscribePanelProfileData } = await import("./panel/panelStore");
    return { assign, storage, getPanelProfileData, subscribePanelProfileData };
  }

  it("merges the opened section into the evidence already collected, keeping older sections", async () => {
    const { assign, getPanelProfileData } = await openEducation({});
    const data = getPanelProfileData();
    expect(assign).not.toHaveBeenCalled();
    expect(data.profile?.experience).toEqual(mainEvidence.experience);
    expect(data.profile?.about).toBe("Builds websites.");
    expect(data.profile?.education.map((e) => e.school)).toContain("State University");
    expect(data.updatingSection).toBe("education");
    expect(data.collection?.status).toBe("settled");
  });

  it("paces its own scan steps instead of waiting for the idle tick interval", async () => {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v1": sessionFor("irev1ak1n") });
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn() }, storage });
    setEducationPage();
    await import("./content");
    await vi.advanceTimersByTimeAsync(3200);
    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().profile?.education.map((e) => e.school)).toContain("State University");
  });

  it("stops persisting once the restored session passes 10 minutes", async () => {
    const createdAt = Date.now() - 10 * 60 * 1000 + 1000;
    const stored = { irev1ak1n: { profileKey: "irev1ak1n", createdAt, updatedAt: createdAt, evidence: mainEvidence, scannedSections: [] } };
    const { storage, getPanelProfileData } = await openEducation({}, stored);
    expect(getPanelProfileData().profile?.education.map((e) => e.school)).toContain("State University");
    const sessions = (await storage.local.get("finder.profileSessions.v1"))["finder.profileSessions.v1"] as Record<string, { createdAt: number; scannedSections: string[] }>;
    expect(sessions.irev1ak1n.createdAt).toBe(createdAt);
    expect(sessions.irev1ak1n.scannedSections).toEqual([]);
  });

  it("persists the merged evidence for the same profile", async () => {
    const { storage } = await openEducation({});
    const sessions = (await storage.local.get("finder.profileSessions.v1"))["finder.profileSessions.v1"] as Record<string, { evidence: LinkedInProfile; scannedSections: string[] }>;
    expect(sessions.irev1ak1n.evidence.experience).toEqual(mainEvidence.experience);
    expect(sessions.irev1ak1n.evidence.education.map((e) => e.school)).toContain("State University");
    expect(sessions.irev1ak1n.scannedSections).toContain("education");
  });

  it("publishes nothing more while the same section stays unchanged", async () => {
    const { subscribePanelProfileData } = await openEducation({});
    const listener = vi.fn();
    subscribePanelProfileData(listener);
    await vi.advanceTimersByTimeAsync(30000);
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores opened sections when the preference is off", async () => {
    const { assign, storage, getPanelProfileData } = await openEducation({ "finder.analyzeOpenedSections.v1": false });
    expect(assign).not.toHaveBeenCalled();
    expect(getPanelProfileData().profile?.education ?? []).toEqual([]);
    const sessions = (await storage.local.get("finder.profileSessions.v1"))["finder.profileSessions.v1"] as Record<string, { evidence: typeof mainEvidence }>;
    expect(sessions.irev1ak1n.evidence.education).toEqual([]);
  });

  it("never merges another person's saved evidence into this profile", async () => {
    const { getPanelProfileData } = await openEducation({}, sessionFor("someone-else"));
    const profile = getPanelProfileData().profile;
    expect(profile?.education.map((e) => e.school)).toContain("State University");
    expect(profile?.experience).toEqual([]);
    expect(profile?.about).toBeUndefined();
  });
});

describe("content.ts bootstrap - profile sessions", () => {
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

  const savedEvidence = {
    ...{ experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] },
    name: "Illia Reviakin",
    about: "Builds websites.",
    education: [{ school: "State University", degree: "BS" }],
    extracted: true,
  };

  function session(profileKey: string, createdAt: number) {
    return { [profileKey]: { profileKey, createdAt, updatedAt: createdAt, evidence: savedEvidence, scannedSections: ["education"] } };
  }

  function setMainPage(): void {
    document.body.innerHTML = `<div id="app-root"><main role="main"><section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section></main></div>`;
  }

  async function reloadMain(stored: unknown) {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v1": stored }),
    });
    setMainPage();
    await import("./content");
    await vi.advanceTimersByTimeAsync(50);
    const { getPanelProfileData } = await import("./panel/panelStore");
    return { getPanelProfileData };
  }

  it("restores a fresh session right away on a full reload, settled, with sections from earlier pages", async () => {
    const { getPanelProfileData } = await reloadMain(session("irev1ak1n", Date.now() - 2 * 60 * 1000));
    const data = getPanelProfileData();
    expect(data.profile?.education.map((e) => e.school)).toEqual(["State University"]);
    expect(data.collection?.status).toBe("settled");
  });

  it("ignores a session older than 10 minutes", async () => {
    const { getPanelProfileData } = await reloadMain(session("irev1ak1n", Date.now() - 11 * 60 * 1000));
    await vi.advanceTimersByTimeAsync(6000);
    expect(getPanelProfileData().profile?.education ?? []).toEqual([]);
  });

  it("never restores another person's session", async () => {
    const { getPanelProfileData } = await reloadMain(session("robert-michels", Date.now()));
    await vi.advanceTimersByTimeAsync(6000);
    expect(getPanelProfileData().profile?.education ?? []).toEqual([]);
    expect(getPanelProfileData().profile?.about).toBeUndefined();
  });
});

describe("content.ts bootstrap - Enhanced analysis toggle", () => {
  let restoreHeight = () => {};
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    restoreHeight = stubRenderedPageHeight();
  });

  afterEach(() => {
    restoreHeight();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    Object.defineProperty(document, "URL", { value: "http://localhost/", configurable: true });
  });

  function setMainProfilePage(): void {
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
        <section>
          <h2>Experience</h2>
          <a href="/in/irev1ak1n/details/experience/">Show all</a>
        </section>
        <section>
          <h2>Education</h2>
          <a href="/in/irev1ak1n/details/education/">Show all</a>
        </section>
      </main>
    `;
  }

  it("Auto scan with Enhanced analysis off scans only the main page: no /details/ navigation, analysis still completes", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      // Enhanced analysis left unset — the default, off.
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    setMainProfilePage();

    await import("./content");
    await vi.advanceTimersByTimeAsync(6000);

    expect(assign).not.toHaveBeenCalled();

    const { getPanelProfileData } = await import("./panel/panelStore");
    const data = getPanelProfileData();
    expect(data.autoScanProgress).toBeNull(); // the crawler never started
    expect(data.collection?.status).toBe("settled"); // the single-page scan still finishes on its own
  });

  it("does not settle Auto scan while the page has not rendered enough to scroll", async () => {
    restoreHeight();
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    setMainProfilePage();

    await import("./content");
    await vi.advanceTimersByTimeAsync(20000);
    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().collection?.status).not.toBe("settled");

    restoreHeight = stubRenderedPageHeight();
    await vi.advanceTimersByTimeAsync(6000);
    expect(getPanelProfileData().collection?.status).toBe("settled");
  });

  it("turning Enhanced analysis on after the main page already settled starts the crawler without discarding its evidence", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    setMainProfilePage();

    await import("./content");
    await vi.advanceTimersByTimeAsync(6000);

    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().autoScanProgress).toBeNull();
    expect(getPanelProfileData().profile?.experience?.length).toBeGreaterThan(0); // main-page evidence already collected

    const { setEnhancedAnalysisPreference } = await import("./panel/enhancedAnalysisStore");
    setEnhancedAnalysisPreference(true);
    await vi.advanceTimersByTimeAsync(3000);

    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/experience/");
    // The evidence collected before the crawler ever started is still there, not thrown away.
    expect(getPanelProfileData().profile?.experience?.length).toBeGreaterThan(0);
  });

  it("turning Enhanced analysis off mid-crawl finishes the open section, then stops opening new ones", async () => {
    const savedSession = {
      sessionId: "toggle-1",
      profileKey: "irev1ak1n",
      originalProfileUrl: "https://www.linkedin.com/in/irev1ak1n/",
      currentIndex: 0,
      status: "scanning",
      startedAt: Date.now(),
      sections: [
        {
          type: "experience",
          heading: "Experience",
          url: "/in/irev1ak1n/details/experience/",
          normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/experience/",
          status: "pending",
          attempts: 0,
        },
        {
          type: "education",
          heading: "Education",
          url: "/in/irev1ak1n/details/education/",
          normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/education/",
          status: "pending",
          attempts: 0,
        },
      ],
    };
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/experience/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.enhancedAnalysis.v1": true,
        "finder.autoScanSession.v1": savedSession,
      }),
    });
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `
      <main role="main">
        <h1><span aria-hidden="true">Illia Reviakin</span></h1>
        <ul><li><span aria-hidden="true">Software Engineer at Acme</span></li></ul>
      </main>
    `;

    const { getPanelProfileData } = await import("./panel/panelStore");
    await import("./content");

    // Step forward in small increments and toggle off the instant Experience is confirmed
    // "scanning" (already open), rather than guessing a fixed delay — extraction can settle
    // fast enough that a single larger jump would already have finished the whole section.
    let sawScanning = false;
    for (let elapsed = 0; elapsed < 5000 && !sawScanning; elapsed += 100) {
      await vi.advanceTimersByTimeAsync(100);
      if (getPanelProfileData().autoScanProgress?.sections[0].status === "scanning") sawScanning = true;
    }
    expect(sawScanning).toBe(true);

    const { setEnhancedAnalysisPreference } = await import("./panel/enhancedAnalysisStore");
    setEnhancedAnalysisPreference(false); // turned off while Experience is still open

    await vi.advanceTimersByTimeAsync(6000); // let Experience finish, then the crawl should stop

    const progress = getPanelProfileData().autoScanProgress;
    // The already-open Experience section finished safely and kept its evidence.
    expect(progress?.sections[0].status).toBe("done");
    // Education never got opened.
    expect(progress?.sections[1].status).toBe("failed");
    expect(assign).not.toHaveBeenCalledWith("/in/irev1ak1n/details/education/");
    expect(progress?.status).toBe("complete");
    expect(getPanelProfileData().profile?.extracted).toBe(true); // evidence collected so far wasn't thrown away
  });
});

describe("content.ts bootstrap - Jobs filtering", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function appliedJobCard(id: string): string {
    return `
      <li data-occludable-job-id="${id}">
        <a href="/jobs/view/${id}/"><span>Job ${id}</span></a>
        <ul><li class="job-card-container__footer-job-state">Applied</li></ul>
      </li>
    `;
  }

  function plainJobCard(id: string, title: string): string {
    return `<li data-occludable-job-id="${id}"><a href="/jobs/view/${id}/"><span>${title}</span></a></li>`;
  }

  function stateJobCard(id: string, title: string, state: string): string {
    return `
      <li data-occludable-job-id="${id}">
        <a href="/jobs/view/${id}/"><span>${title}</span></a>
        <ul><li class="job-card-container__footer-job-state">${state}</li></ul>
      </li>
    `;
  }

  function setJobsSearchPage(html: string): void {
    const appRoot = document.createElement("div");
    appRoot.id = "app-root";
    document.body.appendChild(appRoot);
    appRoot.innerHTML = `<ul class="jobs-list">${html}</ul>`;
  }

  it("hides applied jobs on a jobs search page", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.jobsSettings.v1": { appliedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true } }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(appliedJobCard("1") + plainJobCard("2", "Engineer"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(false);
  });

  it("switching from hide to highlight restores hidden cards and highlights them instead", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.jobsSettings.v1": { appliedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true } }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(appliedJobCard("1"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);

    const { setJobsSettings } = await import("./panel/jobsSettingsStore");
    setJobsSettings({ appliedAction: "highlight", viewedAction: "none", savedAction: "none", keywordsText: "", keywordAction: "none", caseInsensitive: true });
    await vi.advanceTimersByTimeAsync(3000);

    const card = document.querySelector('[data-occludable-job-id="1"]');
    expect(card?.classList.contains("lw-job-hidden")).toBe(false);
    expect(card?.classList.contains("lw-job-highlight")).toBe(true);
  });

  it("do nothing restores normal appearance", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.jobsSettings.v1": { appliedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true } }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(appliedJobCard("1"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    const { setJobsSettings } = await import("./panel/jobsSettingsStore");
    setJobsSettings({ appliedAction: "none", viewedAction: "none", savedAction: "none", keywordsText: "", keywordAction: "none", caseInsensitive: true });
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.className).toBe("");
  });

  it("keyword filtering hides matching cards, case-insensitively by default", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": { appliedAction: "none", keywordsText: "senior, contract", keywordAction: "hide", caseInsensitive: true },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(plainJobCard("1", "SENIOR Engineer") + plainJobCard("2", "Contract Role") + plainJobCard("3", "Junior Role"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="3"]')?.classList.contains("lw-job-hidden")).toBe(false);
  });

  it("processes a newly inserted job card automatically", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.jobsSettings.v1": { appliedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true } }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(plainJobCard("1", "Engineer"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    document.querySelector(".jobs-list")!.insertAdjacentHTML("beforeend", appliedJobCard("2"));
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(true);
  });

  it("does not touch job cards on a non-jobs page", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.jobsSettings.v1": { appliedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true } }),
    });
    stubNonProfileUrl("/feed/");
    setJobsSearchPage(appliedJobCard("1"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.className).toBe("");
  });

  it("reprocesses a new jobs search after SPA navigation", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.jobsSettings.v1": { appliedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true } }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(appliedJobCard("1"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);

    stubNonProfileUrl("/jobs/search/?keywords=designer");
    document.body.innerHTML = "";
    setJobsSearchPage(appliedJobCard("2"));
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(true);
  });

  it("hides viewed jobs when viewedAction is hide", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": { appliedAction: "none", viewedAction: "hide", savedAction: "none", keywordsText: "", keywordAction: "none", caseInsensitive: true },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(stateJobCard("1", "Engineer", "Viewed") + plainJobCard("2", "Designer"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(false);
  });

  it("highlights saved jobs when savedAction is highlight", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": { appliedAction: "none", viewedAction: "none", savedAction: "highlight", keywordsText: "", keywordAction: "none", caseInsensitive: true },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(stateJobCard("1", "Engineer", "Saved"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-highlight")).toBe(true);
  });

  it("applied still hides while viewed and saved act independently at the same time", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": { appliedAction: "hide", viewedAction: "highlight", savedAction: "none", keywordsText: "", keywordAction: "none", caseInsensitive: true },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(appliedJobCard("1") + stateJobCard("2", "Engineer", "Viewed") + stateJobCard("3", "Designer", "Saved"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-highlight")).toBe(true);
    const saved = document.querySelector('[data-occludable-job-id="3"]');
    expect(saved?.classList.contains("lw-job-hidden")).toBe(false);
    expect(saved?.classList.contains("lw-job-highlight")).toBe(false);
  });

  it("hide wins over highlight when a saved card also matches a hide keyword", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": {
          appliedAction: "none",
          viewedAction: "highlight",
          savedAction: "none",
          keywordsText: "Developer",
          keywordAction: "hide",
          caseInsensitive: true,
        },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(stateJobCard("1", "Kotlin Developer", "Viewed"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    const card = document.querySelector('[data-occludable-job-id="1"]');
    expect(card?.classList.contains("lw-job-hidden")).toBe(true);
    expect(card?.classList.contains("lw-job-highlight")).toBe(false);
  });

  it("dynamically inserted cards receive applied, viewed, saved, and keyword rules", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": { appliedAction: "hide", viewedAction: "hide", savedAction: "hide", keywordsText: "", keywordAction: "none", caseInsensitive: true },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(plainJobCard("1", "Engineer"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    document.querySelector(".jobs-list")!.insertAdjacentHTML("beforeend", stateJobCard("2", "Designer", "Saved"));
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(true);
  });

  it("reacts to a job card mutation immediately, without waiting for the general debounce", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.jobsSettings.v1": { appliedAction: "hide", viewedAction: "none", savedAction: "none", keywordsText: "", keywordAction: "none", caseInsensitive: true },
      }),
    });
    stubNonProfileUrl("/jobs/search/?keywords=engineer");
    setJobsSearchPage(plainJobCard("1", "Engineer"));

    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);

    document.querySelector(".jobs-list")!.insertAdjacentHTML("beforeend", appliedJobCard("2"));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(true);
  });
});
