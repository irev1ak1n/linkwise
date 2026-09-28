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
function storedSession(profileKey: string, evidence: object, validatedAt: number) {
  return { profileKey, createdAt: validatedAt, lastValidatedAt: validatedAt, lastEvidenceChangeAt: validatedAt, evidence, scannedSections: [] as string[] };
}

// A tall page whose scroll position really moves, recording every programmatic change.
function stubScrollingPage(height = 5000) {
  const tops = new WeakMap<HTMLElement, number>();
  const writes: number[] = [];
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => height });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get(this: HTMLElement) {
      return tops.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      writes.push(value - (tops.get(this) ?? 0));
      tops.set(this, Math.max(0, Math.min(value, height - 800)));
      this.dispatchEvent(new Event("scroll"));
    },
  });
  return {
    writes,
    restore() {
      for (const name of ["scrollHeight", "clientHeight", "scrollTop"]) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
    },
  };
}

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

  async function scanWithMode(mode: string, ms: number) {
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": mode,
        "finder.autoScrollSpeed.v1": 0.5,
        "finder.goals.v1": [{ id: "g1", name: "Test goal", criteria: [{ id: "c1", label: "Anything", importance: "PREFERRED" }] }],
      }),
    });
    stubProfileUrl("irev1ak1n");
    setProfilePageWithSafeSeeMore();
    const page = stubScrollingPage();
    try {
      await import("./content");
      await vi.advanceTimersByTimeAsync(ms);
    } finally {
      page.restore();
    }
    return page.writes;
  }

  it("Auto scan starts on its own and steps most of a screen at a time", async () => {
    const writes = await scanWithMode("auto", 5000);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(writes.every((delta) => delta === 680)).toBe(true);
  });

  it("Auto scroll starts on its own and reads down in small steps at the chosen speed", async () => {
    const writes = await scanWithMode("autoScroll", 5000);
    expect(writes.length).toBeGreaterThan(50);
    expect(Math.max(...writes)).toBeLessThan(20);
    const total = writes.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(80);
    expect(total).toBeLessThan(160);
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
    return { [profileKey]: storedSession(profileKey, mainEvidence, Date.now()) };
  }

  async function openEducation(prefs: Record<string, unknown>, stored: unknown = sessionFor("irev1ak1n")) {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v2": stored, ...prefs });
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
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v2": sessionFor("irev1ak1n") });
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn() }, storage });
    setEducationPage();
    await import("./content");
    await vi.advanceTimersByTimeAsync(3200);
    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().profile?.education.map((e) => e.school)).toContain("State University");
  });

  it("revalidates a stale session once when an opened section has nothing new", async () => {
    const validatedAt = Date.now() - 11 * 60 * 1000;
    const known = { ...mainEvidence, education: [{ school: "State University", degree: "BS Computer Science" }] };
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v2": { irev1ak1n: storedSession("irev1ak1n", known, validatedAt) } });
    const set = vi.spyOn(storage.local, "set");
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn() }, storage });
    setEducationPage();
    await import("./content");
    await vi.advanceTimersByTimeAsync(30000);

    const { getPanelProfileData } = await import("./panel/panelStore");
    expect(getPanelProfileData().profile?.about).toBe("Builds websites.");
    const writes = set.mock.calls.filter(([items]) => "finder.profileSessions.v2" in items);
    expect(writes).toHaveLength(1);
    const session = (await storage.local.get("finder.profileSessions.v2"))["finder.profileSessions.v2"] as Record<string, { lastValidatedAt: number; lastEvidenceChangeAt: number; evidence: unknown }>;
    expect(session.irev1ak1n.lastValidatedAt).toBeGreaterThan(validatedAt);
    expect(session.irev1ak1n.lastEvidenceChangeAt).toBe(validatedAt);
    expect(session.irev1ak1n.evidence).toEqual(known);
  });

  it("persists the merged evidence for the same profile", async () => {
    const { storage } = await openEducation({});
    const sessions = (await storage.local.get("finder.profileSessions.v2"))["finder.profileSessions.v2"] as Record<string, { evidence: LinkedInProfile; scannedSections: string[] }>;
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
    const sessions = (await storage.local.get("finder.profileSessions.v2"))["finder.profileSessions.v2"] as Record<string, { evidence: typeof mainEvidence }>;
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

  function session(profileKey: string, validatedAt: number) {
    return { [profileKey]: { ...storedSession(profileKey, savedEvidence, validatedAt), scannedSections: ["education"] } };
  }

  function setMainPage(): void {
    document.body.innerHTML = `<div id="app-root"><main role="main"><section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section></main></div>`;
  }

  async function reloadMain(stored: unknown) {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto", "finder.profileSessions.v2": stored }),
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

  it("restores a stale session right away instead of starting over", async () => {
    const { getPanelProfileData } = await reloadMain(session("irev1ak1n", Date.now() - 20 * 60 * 1000));
    const data = getPanelProfileData();
    expect(data.profile?.education.map((e) => e.school)).toEqual(["State University"]);
    expect(data.profile?.about).toBe("Builds websites.");
    expect(data.collection?.status).toBe("settled");
  });

  async function reloadTallMain(scannedSections: string[], ageMs = 20 * 60 * 1000) {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    const stored = { irev1ak1n: { ...storedSession("irev1ak1n", savedEvidence, Date.now() - ageMs), scannedSections } };
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.profileSessions.v2": stored,
        "finder.goals.v1": [{ id: "g1", name: "Test goal", criteria: [{ id: "c1", label: "Anything", importance: "PREFERRED" }] }],
      }),
    });
    setMainPage();
    const page = stubScrollingPage();
    try {
      await import("./content");
      await vi.advanceTimersByTimeAsync(4000);
    } finally {
      page.restore();
    }
    return page.writes.length;
  }

  it("never auto-scrolls a fresh restored profile whose main page was already scanned", async () => {
    expect(await reloadTallMain(["main", "education"], 60 * 1000)).toBe(0);
  });

  it("scans a stale profile again after reload even though its main page was scanned before", async () => {
    expect(await reloadTallMain(["main", "education"])).toBeGreaterThan(0);
  });

  it("still scans the main page when the session only came from detail pages", async () => {
    expect(await reloadTallMain(["education"])).toBeGreaterThan(0);
  });

  it("ignores a session that has not been validated for over a day", async () => {
    const { getPanelProfileData } = await reloadMain(session("irev1ak1n", Date.now() - 25 * 60 * 60 * 1000));
    await vi.advanceTimersByTimeAsync(6000);
    expect(getPanelProfileData().profile?.education ?? []).toEqual([]);
  });

  it("never restores another person's session", async () => {
    const { getPanelProfileData } = await reloadMain(session("jordan-rivera", Date.now()));
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

  it("Auto scan analyzes once, after reaching the end, not while it is still scanning", async () => {
    restoreHeight();
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { id: "test", reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
        "finder.goals.v1": [{ id: "g1", name: "Test goal", criteria: [{ id: "c1", label: "Anything", importance: "PREFERRED" }] }],
      }),
    });
    setMainProfilePage();
    document.querySelector("main")!.insertAdjacentHTML("beforeend", "<section><h2>About</h2><p>Builds websites for student clubs.</p></section>");
    const page = stubScrollingPage(8000);
    try {
      await import("./content");
      const { getPanelProfileData, subscribePanelProfileData } = await import("./panel/panelStore");
      const { autoScroller } = await import("./autoScroller");
      const settledPublishes: unknown[] = [];
      subscribePanelProfileData(() => {
        if (getPanelProfileData().collection?.status === "settled") settledPublishes.push(getPanelProfileData().profile);
      });
      await vi.advanceTimersByTimeAsync(6000);
      expect(autoScroller.getState().status).toBe("running");
      expect(getPanelProfileData().collection?.status).not.toBe("settled");
      await vi.advanceTimersByTimeAsync(20000);
      expect(autoScroller.getState().status).toBe("complete");
      expect(getPanelProfileData().collection?.status).toBe("settled");
      expect(new Set(settledPublishes).size).toBe(1);
    } finally {
      page.restore();
      restoreHeight = stubRenderedPageHeight();
    }
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

describe("content.ts bootstrap - Auto scroll profile", () => {
  let page: ReturnType<typeof stubScrollingPage>;
  const sendMessage = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    page = stubScrollingPage();
    sendMessage.mockReset();
  });

  afterEach(() => {
    page.restore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    Object.defineProperty(document, "URL", { value: "http://localhost/", configurable: true });
  });

  const goals = [{ id: "g1", name: "Test goal", criteria: [{ id: "c1", label: "Anything", importance: "PREFERRED" }] }];

  async function startMain(extra: Record<string, unknown> = {}) {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    const storage = installFakeChromeStorage({ "finder.scanMode.v1": "autoScroll", "finder.goals.v1": goals, ...extra });
    // Requests to the background worker never answer, like a very slow OpenAI call.
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn(), sendMessage }, storage });
    document.body.innerHTML = `
      <div id="app-root"><main role="main">
        <section><h1><span aria-hidden="true">Illia Reviakin</span></h1></section>
        <section><h2>About</h2><p>Builds websites for student clubs and led a 5-student team.</p></section>
      </main></div>
    `;
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);
    const { autoScroller } = await import("./autoScroller");
    const { getPanelProfileData, subscribePanelProfileData } = await import("./panel/panelStore");
    return { autoScroller, storage, getPanelProfileData, subscribePanelProfileData, main: document.querySelector("main")! };
  }

  it("pauses when the user scrolls with the wheel, but never because of its own scrolling", async () => {
    const { autoScroller, main } = await startMain();
    expect(autoScroller.getState().status).toBe("running");
    main.dispatchEvent(new Event("scroll", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(autoScroller.getState().status).toBe("running");

    main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    const at = main.scrollTop;
    await vi.advanceTimersByTimeAsync(3000);
    expect(autoScroller.getState().status).toBe("paused");
    expect(main.scrollTop).toBe(at);
  });

  it("Auto scan finishes on its own even if the user scrolls", async () => {
    const { autoScroller, main } = await startMain({ "finder.scanMode.v1": "auto" });
    main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    expect(autoScroller.getState()).toMatchObject({ status: "running", strategy: "steps" });
  });

  it("pauses on Page Down and ignores clicks inside the LinkWise panel", async () => {
    const { autoScroller, main } = await startMain();
    const host = document.createElement("div");
    host.id = "finder-linkwise-panel-host";
    document.body.append(host);
    host.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    host.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(autoScroller.getState().status).toBe("running");
    main.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }));
    expect(autoScroller.getState().status).toBe("paused");
  });

  it("keeps the result and session while paused, then resumes from the same place", async () => {
    const evidence = { ...{ experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] }, name: "Illia Reviakin", about: "Builds websites for student clubs and led a 5-student team.", extracted: true };
    const { autoScroller, storage, getPanelProfileData, main } = await startMain({ "finder.profileSessions.v2": { irev1ak1n: storedSession("irev1ak1n", evidence, Date.now() - 20 * 60 * 1000) } });
    await vi.advanceTimersByTimeAsync(4000);
    autoScroller.pause();
    const at = main.scrollTop;
    const before = getPanelProfileData();
    const session = (await storage.local.get("finder.profileSessions.v2"))["finder.profileSessions.v2"];
    await vi.advanceTimersByTimeAsync(10000);
    expect(main.scrollTop).toBe(at);
    expect(getPanelProfileData().profile).toBe(before.profile);
    expect(getPanelProfileData().collection?.status).toBe(before.collection?.status);
    expect((await storage.local.get("finder.profileSessions.v2"))["finder.profileSessions.v2"]).toEqual(session);

    autoScroller.resume();
    await vi.advanceTimersByTimeAsync(1000);
    expect(main.scrollTop).toBeGreaterThan(at);
    expect(main.scrollTop - at).toBeLessThan(200);
  });

  it("rescans a stale profile without analyzing its old evidence first when no result is cached", async () => {
    page.restore();
    page = stubScrollingPage(2400);
    const evidence = { ...{ experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] }, name: "Illia Reviakin", about: "Old about text.", extracted: true };
    const { autoScroller, getPanelProfileData } = await startMain({ "finder.profileSessions.v2": { irev1ak1n: storedSession("irev1ak1n", evidence, Date.now() - 20 * 60 * 1000) } });
    expect(autoScroller.getState().status).toBe("running");
    expect(getPanelProfileData().collection?.status).not.toBe("settled");
    await vi.advanceTimersByTimeAsync(50000);
    expect(autoScroller.getState().status).toBe("complete");
    expect(getPanelProfileData().collection?.status).toBe("settled");
    expect(getPanelProfileData().profile?.about).toContain("Builds websites");
  });

  it("runs the final match analysis only after the read-through ends, never on scroll frames", async () => {
    page.restore();
    page = stubScrollingPage(2400);
    const { autoScroller, getPanelProfileData, subscribePanelProfileData } = await startMain();
    const settled: unknown[] = [];
    subscribePanelProfileData(() => {
      if (getPanelProfileData().collection?.status === "settled") settled.push(getPanelProfileData().profile);
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(page.writes.length).toBeGreaterThan(300);
    expect(settled).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(40000);
    expect(autoScroller.getState().status).toBe("complete");
    expect(new Set(settled).size).toBe(1);
  });

  it("switching from Auto scroll to Auto scan keeps the evidence and scans on from the same place", async () => {
    const { autoScroller, getPanelProfileData, main } = await startMain();
    await vi.advanceTimersByTimeAsync(4000);
    const at = main.scrollTop;
    const { setScanMode } = await import("./panel/scanModeStore");
    setScanMode("auto");
    await vi.advanceTimersByTimeAsync(100);
    expect(autoScroller.getState().strategy).toBe("steps");
    expect(main.scrollTop).toBeGreaterThanOrEqual(at);
    await vi.advanceTimersByTimeAsync(20000);
    expect(getPanelProfileData().profile?.about).toContain("Builds websites");
  });

  it("keeps scrolling while signal analysis is still waiting for an answer", async () => {
    const { autoScroller, main } = await startMain({ "finder.signalMode.v1": true });
    await vi.advanceTimersByTimeAsync(6000);
    expect(sendMessage).toHaveBeenCalled();
    const at = main.scrollTop;
    await vi.advanceTimersByTimeAsync(5000);
    expect(autoScroller.getState().status).toBe("running");
    expect(main.scrollTop).toBeGreaterThan(at + 150);
  });

  function settledPublishes(getPanelProfileData: () => { collection?: { status: string } | null; profile?: unknown }, subscribe: (l: () => void) => unknown) {
    const seen: unknown[] = [];
    subscribe(() => {
      if (getPanelProfileData().collection?.status === "settled") seen.push(getPanelProfileData().profile);
    });
    return seen;
  }

  it("analyzes what was collected once the reader takes over, without reaching the bottom", async () => {
    const { autoScroller, getPanelProfileData, main } = await startMain();
    await vi.advanceTimersByTimeAsync(3000);
    expect(getPanelProfileData().collection?.status).not.toBe("settled");
    main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    expect(autoScroller.getState()).toMatchObject({ status: "paused", pausedBy: "user" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(getPanelProfileData().collection?.status).toBe("settled");
    expect(getPanelProfileData().profile?.about).toContain("Builds websites");
    expect(main.scrollTop).toBeLessThan(4000);
  });

  it("waits until the reader stops scrolling before analyzing a takeover", async () => {
    const { getPanelProfileData, main } = await startMain();
    await vi.advanceTimersByTimeAsync(4000);
    for (let i = 0; i < 6; i++) {
      main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(getPanelProfileData().collection?.status).not.toBe("settled");
    await vi.advanceTimersByTimeAsync(2000);
    expect(getPanelProfileData().collection?.status).toBe("settled");
  });

  it("updates once for new evidence found while browsing manually, and never for known content", async () => {
    const { getPanelProfileData, subscribePanelProfileData, main } = await startMain();
    main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    await vi.advanceTimersByTimeAsync(6000);
    const seen = settledPublishes(getPanelProfileData, subscribePanelProfileData);

    main.insertAdjacentHTML("beforeend", "<section><h2>Education</h2><ul><li><p>State University</p><p>BS Computer Science</p></li></ul></section>");
    await vi.advanceTimersByTimeAsync(6000);
    expect(new Set(seen).size).toBe(1);
    expect(getPanelProfileData().profile?.education.map((e) => e.school)).toEqual(["State University"]);

    for (let i = 0; i < 5; i++) {
      main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -120 }));
      main.dispatchEvent(new Event("scroll", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(6000);
    expect(new Set(seen).size).toBe(1);
  });

  it("the Pause button holds analysis back instead of acting like a takeover", async () => {
    const { autoScroller, getPanelProfileData } = await startMain();
    await vi.advanceTimersByTimeAsync(3000);
    autoScroller.pause();
    await vi.advanceTimersByTimeAsync(10000);
    expect(autoScroller.getState().pausedBy).toBe("button");
    expect(getPanelProfileData().collection?.status).not.toBe("settled");
  });

  it("resumes after a takeover from the same place, keeping the partial result", async () => {
    const { autoScroller, getPanelProfileData, main } = await startMain();
    await vi.advanceTimersByTimeAsync(3000);
    main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    await vi.advanceTimersByTimeAsync(6000);
    const result = getPanelProfileData().profile;
    const at = main.scrollTop;
    autoScroller.resume();
    await vi.advanceTimersByTimeAsync(2000);
    expect(autoScroller.getState()).toMatchObject({ status: "running", pausedBy: null });
    expect(main.scrollTop).toBeGreaterThan(at);
    expect(main.scrollTop - at).toBeLessThan(150);
    expect(getPanelProfileData().profile).toBe(result);
  });

  it("picks up a section that renders mid-read right away instead of waiting for the next interval", async () => {
    const { main } = await startMain();
    await vi.advanceTimersByTimeAsync(3000);
    main.insertAdjacentHTML("beforeend", "<section><h2>Experience</h2><p>Web Lead</p><button type=\"button\">…see more</button></section>");
    const clicked = vi.fn();
    main.querySelector("section:last-child button")!.addEventListener("click", clicked);
    await vi.advanceTimersByTimeAsync(1200);
    expect(clicked).toHaveBeenCalled();
  });

  it("asks for signals as soon as new evidence renders, one request at a time", async () => {
    const { main } = await startMain({ "finder.signalMode.v1": true });
    await vi.advanceTimersByTimeAsync(5000);
    const signalCalls = () => sendMessage.mock.calls.filter(([message]) => /signal/i.test(String((message as { type?: string }).type))).length;
    expect(signalCalls()).toBe(1);
    main.insertAdjacentHTML("beforeend", "<section><h2>Education</h2><ul><li><p>State University</p><p>BS Computer Science</p></li></ul></section>");
    await vi.advanceTimersByTimeAsync(10000);
    expect(signalCalls()).toBe(1);
  });

  it("stops at the bottom once and never scrolls back up", async () => {
    page.restore();
    page = stubScrollingPage(1400);
    const { autoScroller, main } = await startMain();
    await vi.advanceTimersByTimeAsync(20000);
    expect(autoScroller.getState().status).toBe("complete");
    const bottom = main.scrollTop;
    expect(bottom).toBeGreaterThanOrEqual(599);
    await vi.advanceTimersByTimeAsync(20000);
    expect(main.scrollTop).toBe(bottom);
    expect(page.writes.every((delta) => delta >= 0)).toBe(true);
  });

  it("publishes a detail page's new evidence as soon as the reader takes over", async () => {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    const evidence = { ...{ experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] }, name: "Illia Reviakin", about: "Builds websites.", extracted: true };
    const storage = installFakeChromeStorage({
      "finder.scanMode.v1": "autoScroll",
      "finder.profileSessions.v2": { irev1ak1n: storedSession("irev1ak1n", evidence, Date.now()) },
    });
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn(), sendMessage }, storage });
    document.body.innerHTML = `<div id="app-root"><main role="main"><section><h2>Education</h2><ul><li><p>State University</p><p>BS Computer Science</p></li></ul></section></main></div>`;
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);
    const { autoScroller } = await import("./autoScroller");
    const { getPanelProfileData } = await import("./panel/panelStore");
    const main = document.querySelector("main")!;
    main.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: 120 }));
    expect(autoScroller.getState().pausedBy).toBe("user");
    document.querySelector("li")!.insertAdjacentHTML("beforeend", "<p>Robotics club captain</p>");
    await vi.advanceTimersByTimeAsync(3000);
    expect(JSON.stringify(getPanelProfileData().profile?.education)).toContain("Robotics club captain");
  });

  it("reads an opened section with the same scroller and publishes once more when it finishes", async () => {
    stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/education/");
    const evidence = { ...{ experience: [], education: [], skills: [], projects: [], certifications: [], organizations: [], volunteering: [], languages: [], honors: [] }, name: "Illia Reviakin", about: "Builds websites.", extracted: true };
    const storage = installFakeChromeStorage({
      "finder.scanMode.v1": "autoScroll",
      "finder.profileSessions.v2": { irev1ak1n: storedSession("irev1ak1n", evidence, Date.now()) },
    });
    vi.stubGlobal("chrome", { runtime: { id: "test", reload: vi.fn(), sendMessage }, storage });
    document.body.innerHTML = `<div id="app-root"><main role="main"><section><h2>Education</h2><ul><li><p>State University</p><p>BS Computer Science</p></li></ul></section></main></div>`;
    await import("./content");
    await vi.advanceTimersByTimeAsync(3000);
    const { autoScroller } = await import("./autoScroller");
    const { getPanelProfileData, subscribePanelProfileData } = await import("./panel/panelStore");
    expect(autoScroller.getState()).toEqual({ status: "running", target: "https://www.linkedin.com/in/irev1ak1n/details/education/", strategy: "smooth", pausedBy: null });
    expect(getPanelProfileData().profile?.education.map((e) => e.school)).toEqual(["State University"]);
    expect(getPanelProfileData().profile?.about).toBe("Builds websites.");

    const listener = vi.fn();
    subscribePanelProfileData(listener);
    document.querySelector("li")!.insertAdjacentHTML("beforeend", "<p>Robotics club captain</p>");
    await vi.advanceTimersByTimeAsync(10000);
    expect(listener).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(90000);
    expect(autoScroller.getState().status).toBe("complete");
    expect(listener).toHaveBeenCalled();
    expect(JSON.stringify(getPanelProfileData().profile?.education)).toContain("Robotics club captain");
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
