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

  // Auto scan's own expansion on a details page is now driven by the checklist crawler (see
  // the "Auto scan checklist" tests below), which arrives there as part of a real queued visit,
  // not from any direct load of a details-page URL on its own.
});

describe("content.ts bootstrap - Auto scan checklist crawler", () => {
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
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    setMainProfilePage();

    await import("./content");
    // The Async variant flushes microtasks between timer firings, needed here since loading
    // the (nonexistent) saved session and evidence is itself async.
    // jsdom reports 0 for every scroll dimension, so "near document end" is trivially true —
    // the main page settles almost immediately once ticked.
    await vi.advanceTimersByTimeAsync(6000);

    expect(assign).toHaveBeenCalledWith("/in/irev1ak1n/details/experience/");
  });

  it("retries discovery instead of locking in an empty queue when the main page settles before its 'Show all' links render", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/");
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
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
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
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
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
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
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
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
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({
        "finder.scanMode.v1": "auto",
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
      runtime: { reload: vi.fn() },
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

  it("redirects to the main profile when a details page loads directly with no session yet", async () => {
    const { assign } = stubNavigableLocation("https://www.linkedin.com/in/irev1ak1n/details/experience/");
    vi.stubGlobal("chrome", {
      runtime: { reload: vi.fn() },
      storage: installFakeChromeStorage({ "finder.scanMode.v1": "auto" }),
    });
    setDetailsPage("Experience", "Software Engineer at Acme");

    await import("./content");
    await Promise.resolve();
    await Promise.resolve();

    expect(assign).toHaveBeenCalledWith("https://www.linkedin.com/in/irev1ak1n/");
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
      runtime: { reload: vi.fn() },
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
