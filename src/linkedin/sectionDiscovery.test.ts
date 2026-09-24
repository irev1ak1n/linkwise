// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { discoverProfileSections, excludeFromAutoScanQueue } from "./sectionDiscovery";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe("discoverProfileSections - finds real detail-page links", () => {
  it("discovers a known section from its 'Show all' link's own href, not its visible text", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Experience</h2>
          <a href="/in/irev1ak1n/details/experience/">Show all 5 experiences right this way</a>
        </section>
      </main>
    `);
    const found = discoverProfileSections(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      type: "experience",
      normalizedUrl: "https://www.linkedin.com/in/irev1ak1n/details/experience/",
      confidence: 1,
    });
  });

  it("discovers every recognized section present, in one pass", () => {
    setBody(`
      <main role="main">
        <section><h2>Experience</h2><a href="/in/irev1ak1n/details/experience/">Show all</a></section>
        <section><h2>Education</h2><a href="/in/irev1ak1n/details/education/">Show all</a></section>
        <section><h2>Skills</h2><a href="/in/irev1ak1n/details/skills/">Show all</a></section>
        <section><h2>Projects</h2><a href="/in/irev1ak1n/details/projects/">Show all</a></section>
        <section><h2>Languages</h2><a href="/in/irev1ak1n/details/languages/">Show all</a></section>
        <section><h2>Honors &amp; awards</h2><a href="/in/irev1ak1n/details/honors/">Show all</a></section>
      </main>
    `);
    const found = discoverProfileSections(document);
    expect(found.map((s) => s.type).sort()).toEqual(["education", "experience", "honors", "languages", "projects", "skills"].sort());
  });

  it("normalizes an absolute URL with tracking params the same as a bare relative href", () => {
    setBody(`
      <main role="main">
        <a href="https://www.linkedin.com/in/irev1ak1n/details/experience/?originalSubdomain=en">Show all</a>
      </main>
    `);
    const found = discoverProfileSections(document);
    expect(found[0].normalizedUrl).toBe("https://www.linkedin.com/in/irev1ak1n/details/experience/");
  });

  it("does not queue a section with no detail page at all (e.g. About)", () => {
    setBody(`<main role="main"><section><h2>About</h2><span>Some bio text.</span></section></main>`);
    expect(discoverProfileSections(document)).toEqual([]);
  });

  it("deduplicates the same detail URL linked twice", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Experience</h2>
          <a href="/in/irev1ak1n/details/experience/">Show all</a>
          <a href="/in/irev1ak1n/details/experience/">See more experience</a>
        </section>
      </main>
    `);
    expect(discoverProfileSections(document)).toHaveLength(1);
  });
});

describe("discoverProfileSections - safety and extensibility", () => {
  it("never discovers a link inside the right-rail sidebar", () => {
    setBody(`
      <main role="main">
        <aside><a href="/in/someone-else/details/experience/">Unrelated</a></aside>
        <section><h2>Experience</h2><a href="/in/irev1ak1n/details/experience/">Show all</a></section>
      </main>
    `);
    const found = discoverProfileSections(document);
    expect(found).toHaveLength(1);
    expect(found[0].normalizedUrl).toContain("irev1ak1n");
  });

  it("never discovers a link inside global nav/header", () => {
    setBody(`
      <main role="main">
        <header><nav><a href="/in/x/details/experience/">nav link</a></nav></header>
        <section><h2>Experience</h2><a href="/in/irev1ak1n/details/experience/">Show all</a></section>
      </main>
    `);
    expect(discoverProfileSections(document)).toHaveLength(1);
  });

  it("still queues an unrecognized section slug as 'unknown' rather than dropping it", () => {
    setBody(`
      <main role="main">
        <section><h2>Featured</h2><a href="/in/irev1ak1n/details/featured/">Show all</a></section>
      </main>
    `);
    const found = discoverProfileSections(document);
    expect(found).toHaveLength(1);
    expect(found[0].type).toBe("unknown");
    expect(found[0].confidence).toBeLessThan(1);
  });

  it("returns an empty list when there is no main content at all", () => {
    setBody(`<div>Not a profile page</div>`);
    expect(discoverProfileSections(document)).toEqual([]);
  });
});

describe("excludeFromAutoScanQueue", () => {
  it("drops a discovered Skills section, keeping everything else", () => {
    setBody(`
      <main role="main">
        <section><h2>Experience</h2><a href="/in/irev1ak1n/details/experience/">Show all</a></section>
        <section><h2>Skills</h2><a href="/in/irev1ak1n/details/skills/">Show all</a></section>
      </main>
    `);
    const queued = excludeFromAutoScanQueue(discoverProfileSections(document));
    expect(queued.map((s) => s.type)).toEqual(["experience"]);
  });
});

describe("discoverProfileSections - never queues an editing route", () => {
  it("skips an 'edit this entry' link even when it's the only link for that section", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Volunteering</h2>
          <a href="/in/irev1ak1n/details/volunteer-experiences/edit/forms/1258231471/">Edit</a>
        </section>
      </main>
    `);
    expect(discoverProfileSections(document)).toEqual([]);
  });

  it("skips an add/create form even when it's the only link and has no 'edit' in its path", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Skills</h2>
          <a href="/in/irev1ak1n/details/skills/add/">Add a skill</a>
        </section>
      </main>
    `);
    expect(discoverProfileSections(document)).toEqual([]);
  });

  it("prefers a real 'Show all' link over a sibling edit link for the same section", () => {
    setBody(`
      <main role="main">
        <section>
          <h2>Education</h2>
          <a href="/in/irev1ak1n/details/education/edit/forms/12345/">Edit</a>
          <a href="/in/irev1ak1n/details/education/">Show all 5 educations</a>
        </section>
      </main>
    `);
    const found = discoverProfileSections(document);
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe("/in/irev1ak1n/details/education/");
  });
});
