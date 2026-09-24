// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { _internal, expandSeeMoreToggles } from "./expandContent";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function countClicks(button: Element): { count: number } {
  const tracker = { count: 0 };
  button.addEventListener("click", () => {
    tracker.count += 1;
  });
  return tracker;
}

describe("expandSeeMoreToggles - real profile sections (safe)", () => {
  it("expands About's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>About</h2>
          <span>Long bio text…</span>
          <button type="button">…see more</button>
        </section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expect(expandSeeMoreToggles(document)).toBe(1);
    expect(tracker.count).toBe(1);
  });

  it("expands an Experience description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Experience</h2>
          <ul><li>
            <span>Software Engineer</span>
            <span>Some Company</span>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expect(expandSeeMoreToggles(document)).toBe(1);
    expect(tracker.count).toBe(1);
  });

  it("expands an Education description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Education</h2>
          <ul><li>
            <span>State University</span>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expect(expandSeeMoreToggles(document)).toBe(1);
    expect(tracker.count).toBe(1);
  });

  it("expands a Projects description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Projects</h2>
          <ul><li>
            <span>A Cool Project</span>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expect(expandSeeMoreToggles(document)).toBe(1);
    expect(tracker.count).toBe(1);
  });

  it("expands a Volunteering description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Volunteering</h2>
          <ul><li>
            <span>Community Helper</span>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands an Honors & awards description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Honors &amp; awards</h2>
          <ul><li>
            <span>Employee of the Month</span>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands a Licenses & certifications description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Licenses &amp; certifications</h2>
          <ul><li>
            <span>Certified Something</span>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands an Organizations description's 'see more'", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Organizations</h2>
          <ul><li><span>A Club</span><button type="button">…see more</button></li></ul>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });
});

describe("expandSeeMoreToggles - Activity, posts, and other non-profile content (unsafe)", () => {
  it("never expands a 'see more' inside the Activity section", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Activity</h2>
          <div>
            <p>Excited to share this update…</p>
            <button type="button">…see more</button>
          </div>
        </section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expect(expandSeeMoreToggles(document)).toBe(0);
    expect(tracker.count).toBe(0);
  });

  it("rejects a post 'see more' that would navigate to /feed/update/...", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Activity</h2>
          <div data-tracking-control-name="feed_shared_update_v2_see_more">
            <p>A repost…</p>
            <button type="button" aria-label="see more, navigates to /feed/update/urn:li:activity:123">…see more</button>
          </div>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("rejects a control that links to /posts/", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Activity</h2>
          <a href="/posts/someone_a-cool-post-1234"><button type="button">…see more</button></a>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("rejects an ad's 'see more', even without a recognizable heading at all", () => {
    setBody(`
      <main role="main">
        <div class="ad-unit">
          <p>Sponsored content…</p>
          <button type="button">…see more</button>
        </div>
        <section><h2>About</h2><span>Real content</span></section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("never expands inside a section whose heading isn't a recognized profile section at all", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>People you may know</h2>
          <button type="button">…see more</button>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("never clicks a control outside main entirely, e.g. global nav or messaging", () => {
    setBody(`
      <nav><button type="button">…see more</button></nav>
      <main role="main"><section><h2>About</h2><span>Real content</span></section></main>
    `);
    const tracker = countClicks(document.querySelector("nav button")!);
    expandSeeMoreToggles(document);
    expect(tracker.count).toBe(0);
  });

  it("does not click a button whose text merely contains the word 'more' as part of a longer sentence", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">Learn more about how connections work</button></section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });
});

describe("expandSeeMoreToggles - navigation safety checks directly", () => {
  it("_internal.isSafeSectionHeading recognizes every real profile section heading", () => {
    for (const heading of [
      "About",
      "Experience",
      "Education",
      "Skills",
      "Projects",
      "Licenses & certifications",
      "Organizations",
      "Volunteering",
      "Languages",
      "Honors & awards",
    ]) {
      expect(_internal.isSafeSectionHeading(heading)).toBe(true);
    }
  });

  it("_internal.isSafeSectionHeading rejects Activity and other non-profile headings", () => {
    for (const heading of ["Activity", "People you may know", "You might like", "Recommended for you", ""]) {
      expect(_internal.isSafeSectionHeading(heading)).toBe(false);
    }
  });

  it("_internal.wouldNavigateAway flags every unsafe route pattern", () => {
    for (const path of ["/feed/update/urn:li:activity:1/", "/posts/someone_x-1/", "/pulse/an-article/", "/company/acme/", "/jobs/view/1/"]) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", `see more ${path}`);
      expect(_internal.wouldNavigateAway(button)).toBe(true);
    }
  });

  it("_internal.wouldNavigateAway is false for a plain inline toggle with no navigation signal", () => {
    const button = document.createElement("button");
    button.textContent = "…see more";
    expect(_internal.wouldNavigateAway(button)).toBe(false);
  });

  it("does not reject an Experience 'see more' merely because the same card also links to a company page", () => {
    // A very plausible real pattern: the company name in an Experience entry links to
    // /company/..., right next to the description's own plain toggle button. That unrelated
    // link must never cause the toggle itself to be rejected.
    setBody(`
      <main role="main">
        <section>
          <h2>Experience</h2>
          <ul><li>
            <span>Software Engineer</span>
            <a href="/company/acme/">Acme Corp</a>
            <button type="button">…see more</button>
          </li></ul>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });
});

describe("expandSeeMoreToggles - no repeated clicks, no loops", () => {
  it("never clicks the same toggle twice across repeated calls", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expandSeeMoreToggles(document);
    expandSeeMoreToggles(document);
    expandSeeMoreToggles(document);
    expect(tracker.count).toBe(1);
  });

  it("expands multiple distinct safe toggles across different sections in one call", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
        <section><h2>Experience</h2><button type="button">…more</button></section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(2);
  });

  it("caps how many it expands in a single call, never an unbounded click storm", () => {
    const sections = Array.from({ length: 40 }, () => `<section><h2>About</h2><button type="button">…see more</button></section>`).join(
      "",
    );
    setBody(`<main role="main">${sections}</main>`);
    const expanded = expandSeeMoreToggles(document);
    expect(expanded).toBeLessThan(40);
    expect(expanded).toBeGreaterThan(0);
  });
});

describe("expandSeeMoreToggles - never navigates away from the profile", () => {
  it("a safe click never changes the page location", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    const before = location.href;
    expandSeeMoreToggles(document);
    expect(location.href).toBe(before);
  });

  it("an Activity 'see more' rigged to navigate on click never actually fires, because it's never clicked", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Activity</h2>
          <button type="button" id="risky">…see more</button>
        </section>
      </main>
    `);
    const button = document.getElementById("risky") as HTMLButtonElement;
    let navigated = false;
    button.addEventListener("click", () => {
      navigated = true; // stands in for a real SPA navigation the click handler would trigger
    });
    expandSeeMoreToggles(document);
    expect(navigated).toBe(false);
  });
});

describe("expandSeeMoreToggles - viewport restriction for 'Analyze as I scroll' (restrictToViewport)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubViewportHeight(height: number): void {
    vi.stubGlobal("innerHeight", height);
  }

  function stubRect(el: Element, top: number, bottom: number): void {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it("expands a safe toggle that's already fully visible on screen", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    stubRect(document.querySelector("button")!, 100, 140);
    expect(expandSeeMoreToggles(document, { restrictToViewport: true })).toBe(1);
  });

  it("does not expand a safe toggle that's off-screen below the viewport", () => {
    setBody(`
      <main role="main">
        <section><h2>Education</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    stubRect(document.querySelector("button")!, 2000, 2040);
    expect(expandSeeMoreToggles(document, { restrictToViewport: true })).toBe(0);
  });

  it("does not expand a safe toggle that's off-screen above the viewport", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    stubRect(document.querySelector("button")!, -500, -460);
    expect(expandSeeMoreToggles(document, { restrictToViewport: true })).toBe(0);
  });

  it("without restrictToViewport (Auto scan), expands an off-screen safe toggle anyway", () => {
    setBody(`
      <main role="main">
        <section><h2>Education</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    stubRect(document.querySelector("button")!, 2000, 2040);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("a scroll-restricted click never calls scrollIntoView, window.scrollTo, or window.scrollBy", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    const button = document.querySelector("button")!;
    stubRect(button, 100, 140);
    const scrollIntoViewSpy = vi.fn();
    button.scrollIntoView = scrollIntoViewSpy;
    const scrollToSpy = vi.fn();
    const scrollBySpy = vi.fn();
    vi.stubGlobal("scrollTo", scrollToSpy);
    vi.stubGlobal("scrollBy", scrollBySpy);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    expandSeeMoreToggles(document, { restrictToViewport: true });

    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
    expect(scrollBySpy).not.toHaveBeenCalled();
  });

  // The anchor is a *different* element than the button (the entry's own <section>/<li>), whose
  // own DOCUMENT position (independent of scrolling) only changes when something external shifts
  // it — never because the button's own trailing text grows. A real browser reports
  // rect.top = documentPosition - scrollTop, so the mock computes it the same way from a
  // controllable docPos, letting these tests express "a genuine layout shift happened" (docPos
  // changes) separately from "the user also scrolled" (scrollTop changes) — exactly what
  // clickPreservingScroll's own math is designed to tell apart.
  function stubAnchorAtDocPos(el: Element, getDocPos: () => number): void {
    vi.spyOn(el, "getBoundingClientRect").mockImplementation(() => {
      const top = getDocPos() - document.documentElement.scrollTop;
      return { top, bottom: top + 200, left: 0, right: 0, width: 0, height: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    });
  }

  it("compensates for a layout shift detected synchronously right after the click", () => {
    setBody(`
      <main role="main">
        <section id="s"><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    const button = document.querySelector("button")!;
    const section = document.getElementById("s")!;
    stubRect(button, 100, 140);
    document.documentElement.scrollTop = 500;
    let docPos = 600; // rect.top = 600 - 500 = 100, matching the anchor's initial on-screen spot
    stubAnchorAtDocPos(section, () => docPos);
    button.addEventListener("click", () => {
      docPos = 640; // something pushed the anchor 40px further down in the document itself
    });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    expandSeeMoreToggles(document, { restrictToViewport: true });

    // Compensates by exactly the observed 40px shift, landing the anchor back where it was.
    expect(document.documentElement.scrollTop).toBe(540);
  });

  it("compensates for a layout shift that only appears asynchronously (next animation frame)", () => {
    setBody(`
      <main role="main">
        <section id="s"><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    const button = document.querySelector("button")!;
    const section = document.getElementById("s")!;
    stubRect(button, 100, 140);
    document.documentElement.scrollTop = 300;
    let docPos = 500; // rect.top = 500 - 300 = 200
    stubAnchorAtDocPos(section, () => docPos);
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 0;
    });

    expandSeeMoreToggles(document, { restrictToViewport: true });
    expect(document.documentElement.scrollTop).toBe(300); // no synchronous shift yet

    docPos = 560; // LinkedIn's async render pushes the anchor 60px further down, next frame
    rafCallback!(0);

    expect(document.documentElement.scrollTop).toBe(360);
  });

  it("never fights the user's own scrolling: only cancels the layout-caused portion of any shift", () => {
    setBody(`
      <main role="main">
        <section id="s"><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    const button = document.querySelector("button")!;
    const section = document.getElementById("s")!;
    stubRect(button, 100, 140);
    document.documentElement.scrollTop = 300;
    let docPos = 500; // rect.top = 500 - 300 = 200
    stubAnchorAtDocPos(section, () => docPos);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    button.addEventListener("click", () => {
      // Both happen together: the user scrolls another 100px down on their own, AND a genuine
      // 40px layout shift occurs — net observed anchor position reflects both combined.
      document.documentElement.scrollTop = 400;
      docPos = 540;
    });

    expandSeeMoreToggles(document, { restrictToViewport: true });

    // Only the 40px layout component is added on top of wherever the user scrolled to (400) —
    // never a reset back toward the pre-click position (300).
    expect(document.documentElement.scrollTop).toBe(440);
  });

  it("temporarily disables native scroll anchoring on the container during the expansion, then restores it", () => {
    setBody(`
      <main role="main">
        <section><h2>About</h2><button type="button">…see more</button></section>
      </main>
    `);
    stubViewportHeight(800);
    const button = document.querySelector("button")!;
    stubRect(button, 100, 140);
    document.documentElement.style.setProperty("overflow-anchor", "auto");
    let duringValue: string | null = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      duringValue = document.documentElement.style.getPropertyValue("overflow-anchor");
      cb(0);
      return 0;
    });

    expandSeeMoreToggles(document, { restrictToViewport: true });

    expect(duringValue).toBe("none");
    expect(document.documentElement.style.getPropertyValue("overflow-anchor")).toBe("auto");
  });

  it("_internal.isWithinViewport is true for a fully visible rect and false for an off-screen one", () => {
    stubViewportHeight(800);
    const visible = document.createElement("button");
    stubRect(visible, 100, 140);
    expect(_internal.isWithinViewport(visible)).toBe(true);

    const offscreen = document.createElement("button");
    stubRect(offscreen, 900, 940);
    expect(_internal.isWithinViewport(offscreen)).toBe(false);
  });
});

describe("expandSeeMoreToggles - Projects entries wrapped in their own inner section (structural detection)", () => {
  it("expands a Projects entry's 'more' even though the entry has its own inner <section> with an unrelated heading (the project's own name)", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Projects</h2>
          <section>
            <h3>Project Alpha</h3>
            <p>Some description…</p>
            <button type="button">more</button>
          </section>
        </section>
      </main>
    `);
    const tracker = countClicks(document.querySelector("button")!);
    expect(expandSeeMoreToggles(document)).toBe(1);
    expect(tracker.count).toBe(1);
  });

  it("expands multiple Projects entries, each with their own inner section, in one call", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Projects</h2>
          <section><h3>Project Alpha</h3><button type="button">more</button></section>
          <section><h3>Project Beta</h3><button type="button">more</button></section>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(2);
  });

  it("_internal.isSafeSectionHeading rejects a project's own name as a heading on its own", () => {
    expect(_internal.isSafeSectionHeading("Project Alpha")).toBe(false);
  });

  it("_internal.ownHeadingText finds only a section's own heading, not one owned by a nested inner section", () => {
    setBody(`
      <main role="main">
        <section id="outer">
          <h2>Projects</h2>
          <section id="inner"><h3>Project Alpha</h3></section>
        </section>
      </main>
    `);
    const outer = document.getElementById("outer")!;
    const inner = document.getElementById("inner")!;
    expect(_internal.ownHeadingText(outer)).toBe("Projects");
    expect(_internal.ownHeadingText(inner)).toBe("Project Alpha");
  });

  it("still never expands an Activity post nested the same way (its own inner section, unrelated heading, unsafe outer)", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Activity</h2>
          <section>
            <h3>A repost</h3>
            <button type="button">…see more</button>
          </section>
        </section>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("a scroll-restricted Projects 'more' still expands smoothly once visible, same as any other section", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Projects</h2>
          <section><h3>Project Alpha</h3><button type="button">more</button></section>
        </section>
      </main>
    `);
    vi.stubGlobal("innerHeight", 800);
    vi.spyOn(document.querySelector("button")!, "getBoundingClientRect").mockReturnValue({
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
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    expect(expandSeeMoreToggles(document, { restrictToViewport: true })).toBe(1);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe("expandSeeMoreToggles - profile detail pages (/details/{section}/, no <section> wrapper)", () => {
  const ORIGINAL_DOCUMENT_URL = document.URL;

  afterEach(() => {
    Object.defineProperty(document, "URL", { value: ORIGINAL_DOCUMENT_URL, configurable: true });
  });

  // Confirmed live: a "/details/{section}/" page renders its content directly in <main>, no
  // <section> wrapper anywhere — unlike the main profile page's multi-section layout.
  function stubDetailsPageUrl(section: string): void {
    Object.defineProperty(document, "URL", {
      value: `https://www.linkedin.com/in/irev1ak1n/details/${section}/`,
      configurable: true,
    });
  }

  it("still expands a safe 'more' on the main profile page (baseline, unaffected)", () => {
    setBody(`<main role="main"><section><h2>Experience</h2><button type="button">…see more</button></section></main>`);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands a safe 'more' on /details/education/", () => {
    stubDetailsPageUrl("education");
    setBody(`
      <main role="main">
        <h1>Education</h1>
        <ul><li><span>State University</span><button type="button">more</button></li></ul>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands a safe 'more' on /details/projects/", () => {
    stubDetailsPageUrl("projects");
    setBody(`<main role="main"><h1>Projects</h1><div><button type="button">more</button></div></main>`);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands a safe 'more' on /details/honors/", () => {
    stubDetailsPageUrl("honors");
    setBody(`<main role="main"><h1>Honors &amp; awards</h1><div><button type="button">more</button></div></main>`);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("expands a safe 'more' on /details/experience/", () => {
    stubDetailsPageUrl("experience");
    setBody(`<main role="main"><h1>Experience</h1><div><button type="button">…see more</button></div></main>`);
    expect(expandSeeMoreToggles(document)).toBe(1);
  });

  it("still rejects a details-page control inside the right-rail sidebar (aside)", () => {
    stubDetailsPageUrl("education");
    setBody(`
      <main role="main">
        <h1>Education</h1>
        <aside><button type="button">more</button></aside>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("still rejects the site's own top-nav overflow 'More' button on a details page", () => {
    stubDetailsPageUrl("education");
    setBody(`
      <main role="main">
        <header><nav><button type="button">More</button></nav></header>
        <h1>Education</h1>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("still rejects a control on a details page that would navigate to /feed/update/...", () => {
    stubDetailsPageUrl("education");
    setBody(`
      <main role="main">
        <h1>Education</h1>
        <button type="button" aria-label="see more, navigates to /feed/update/urn:li:activity:1">…see more</button>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("still rejects a control that links to /posts/ on a details page", () => {
    stubDetailsPageUrl("education");
    setBody(`
      <main role="main">
        <h1>Education</h1>
        <a href="/posts/someone_x-1"><button type="button">…see more</button></a>
      </main>
    `);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("does not treat an unrecognized details slug (e.g. /details/recommendations/) as safe", () => {
    stubDetailsPageUrl("recommendations");
    setBody(`<main role="main"><h1>Recommendations</h1><button type="button">more</button></main>`);
    expect(expandSeeMoreToggles(document)).toBe(0);
  });

  it("_internal.isInsideExcludedLandmark is true inside aside/header/nav, false elsewhere", () => {
    setBody(`
      <main role="main">
        <aside><button id="a">x</button></aside>
        <header><button id="h">x</button></header>
        <nav><button id="n">x</button></nav>
        <div><button id="d">x</button></div>
      </main>
    `);
    expect(_internal.isInsideExcludedLandmark(document.getElementById("a") as HTMLButtonElement)).toBe(true);
    expect(_internal.isInsideExcludedLandmark(document.getElementById("h") as HTMLButtonElement)).toBe(true);
    expect(_internal.isInsideExcludedLandmark(document.getElementById("n") as HTMLButtonElement)).toBe(true);
    expect(_internal.isInsideExcludedLandmark(document.getElementById("d") as HTMLButtonElement)).toBe(false);
  });

  it("_internal.isRecognizedDetailsPageUrl recognizes every real details slug and rejects unknown ones", () => {
    for (const slug of [
      "experience",
      "education",
      "skills",
      "languages",
      "honors",
      "certifications",
      "projects",
      "volunteering-experience",
      "organizations",
    ]) {
      expect(_internal.isRecognizedDetailsPageUrl(`https://www.linkedin.com/in/x/details/${slug}/`)).toBe(true);
    }
    expect(_internal.isRecognizedDetailsPageUrl("https://www.linkedin.com/in/x/details/recommendations/")).toBe(false);
    expect(_internal.isRecognizedDetailsPageUrl("https://www.linkedin.com/in/x/")).toBe(false);
  });

  it("a scroll-restricted 'more' on a details page still expands smoothly once visible", () => {
    stubDetailsPageUrl("education");
    setBody(`<main role="main"><h1>Education</h1><button type="button">more</button></main>`);
    vi.stubGlobal("innerHeight", 800);
    vi.spyOn(document.querySelector("button")!, "getBoundingClientRect").mockReturnValue({
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
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    expect(expandSeeMoreToggles(document, { restrictToViewport: true })).toBe(1);

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
