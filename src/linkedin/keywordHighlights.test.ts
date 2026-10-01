// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEYWORD_HIGHLIGHT, KeywordHighlighter, locateKeywords, parseKeywords } from "./keywordHighlights";
import { QUOTE_HIGHLIGHT, SignalHighlighter, type HighlightRegistryLike } from "./signalHighlighter";
import { HIGHLIGHT_SHADES } from "./highlightPalette";

function fakeRegistry() {
  const entries = new Map<string, { ranges: Range[] }>();
  const registry: HighlightRegistryLike = {
    set: vi.fn((name: string, h: Highlight) => entries.set(name, h as unknown as { ranges: Range[] })),
    delete: vi.fn((name: string) => entries.delete(name)),
  };
  return { registry, entries };
}

const factory = (ranges: Range[]) => ({ ranges }) as unknown as Highlight;

const PROFILE = `
  <header><nav><a>Home</a><p>Python jobs near you</p></nav></header>
  <main role="main">
    <section><h1>Jordan Rivera</h1><p>TSA officer and Python tutor</p></section>
    <section><h2>About</h2><p>I learned <b>Python</b> and C++ over 9 years, and tutored for 200+ hours of tutoring.</p></section>
    <section><h2>Experience</h2><p>Webmaster</p><p>TSA — Technology Student Association</p><p>Led a 5-student team; pythonic code is not a match.</p></section>
    <section><h2>Activity</h2><p>Reposted: Python tips for everyone</p></section>
  </main>
  <aside><p>People also viewed: Python developer</p></aside>`;

function setPage(url = "https://www.linkedin.com/in/jordan/", html = PROFILE): void {
  Object.defineProperty(document, "URL", { value: url, configurable: true });
  document.head.innerHTML = "";
  document.body.innerHTML = html;
}

const texts = (ranges: Range[]) => ranges.map((r) => r.toString());

describe("parseKeywords", () => {
  it("splits on commas and new lines, trims, drops empties, and dedupes ignoring case", () => {
    expect(parseKeywords(" Python, robotics ,\nTSA\n\n,python,  machine   learning ,100+ hours")).toEqual(["Python", "robotics", "TSA", "machine learning", "100+ hours"]);
    expect(parseKeywords("  ,\n ")).toEqual([]);
  });
});

describe("locateKeywords", () => {
  beforeEach(() => setPage());

  it("matches whole words and phrases in any case, including titles and organizations", () => {
    expect(texts(locateKeywords(document, ["python"]))).toEqual(["Python", "Python"]);
    expect(texts(locateKeywords(document, ["tsa"]))).toEqual(["TSA", "TSA"]);
    expect(texts(locateKeywords(document, ["technology student association", "WEBMASTER"]))).toEqual(["Technology Student Association", "Webmaster"]);
  });

  it("matches phrases that span inline markup and symbols", () => {
    expect(texts(locateKeywords(document, ["learned python", "c++", "200+ hours"]))).toEqual(["learned Python", "C++", "200+ hours"]);
  });

  it("ignores navigation, sidebars, and activity, and never matches inside another word", () => {
    const ranges = locateKeywords(document, ["python"]);
    expect(ranges.every((r) => !r.startContainer.parentElement!.closest("nav, aside"))).toBe(true);
    expect(ranges.some((r) => r.startContainer.textContent!.includes("Reposted"))).toBe(false);
    expect(texts(locateKeywords(document, ["pythonic"]))).toEqual(["pythonic"]);
    expect(texts(locateKeywords(document, ["tutor"]))).toEqual(["tutor"]);
  });

  it("works on a details page, scoped to its list of entries", () => {
    setPage(
      "https://www.linkedin.com/in/jordan/details/experience/",
      `<main role="main"><div><p>Jordan Rivera</p><p>Python tutor</p></div>
        <div data-testid="profile_ExperienceDetailsSection_jordan"><p>Tutor</p><p>Taught Python to 20+ students</p></div></main>`,
    );
    const ranges = locateKeywords(document, ["python"]);
    expect(texts(ranges)).toEqual(["Python"]);
    expect(ranges[0]!.startContainer.textContent).toBe("Taught Python to 20+ students");
  });
});

describe("KeywordHighlighter", () => {
  beforeEach(() => setPage());
  afterEach(() => vi.restoreAllMocks());

  it("highlights matches without changing the page, and picks up content added later", () => {
    const { registry, entries } = fakeRegistry();
    const highlighter = new KeywordHighlighter(document, registry, factory);
    const before = document.querySelector("main")!.innerHTML;
    expect(highlighter.render(["tsa"])).toBe(2);
    expect(document.querySelector("main")!.innerHTML).toBe(before);

    document.querySelector("main section:nth-of-type(3)")!.insertAdjacentHTML("beforeend", "<p>Won 2nd place at TSA Regionals</p>");
    expect(highlighter.render(["tsa"])).toBe(3);
    expect(texts(entries.get(KEYWORD_HIGHLIGHT)!.ranges)).toEqual(["TSA", "TSA", "TSA"]);
  });

  it("removes only its own highlight when the list is cleared, leaving Signal highlights in place", () => {
    const { registry, entries } = fakeRegistry();
    const signals = new SignalHighlighter(document, registry, factory);
    const keywords = new KeywordHighlighter(document, registry, factory);
    signals.render([{ key: "a", section: "about", quote: "tutored for 200+ hours of tutoring", metrics: [] }]);
    keywords.render(["tutoring"]);
    expect([...entries.keys()]).toEqual(expect.arrayContaining([QUOTE_HIGHLIGHT, KEYWORD_HIGHLIGHT]));

    keywords.render([]);
    expect(entries.has(KEYWORD_HIGHLIGHT)).toBe(false);
    expect(texts(entries.get(QUOTE_HIGHLIGHT)!.ranges)).toEqual(["tutored for 200+ hours of tutoring"]);
  });

  it("layers over a Signal highlight on the same words without nesting or duplicating text", () => {
    const { registry, entries } = fakeRegistry();
    const signals = new SignalHighlighter(document, registry, factory);
    const keywords = new KeywordHighlighter(document, registry, factory);
    const before = document.body.innerHTML;
    const aboutText = document.querySelectorAll("main section")[1]!.textContent;
    for (let i = 0; i < 3; i++) {
      signals.render([{ key: "a", section: "about", quote: "200+ hours of tutoring", metrics: ["200+ hours"] }]);
      keywords.render(["200+ hours", "tutoring"]);
    }
    expect(texts(entries.get(KEYWORD_HIGHLIGHT)!.ranges)).toEqual(["200+ hours", "tutoring"]);
    expect(texts(entries.get(QUOTE_HIGHLIGHT)!.ranges)).toEqual(["200+ hours of tutoring"]);
    expect(document.querySelectorAll("main section")[1]!.textContent).toBe(aboutText);
    expect(document.body.innerHTML).toBe(before);
    expect(document.head.querySelectorAll("style")).toHaveLength(2);
  });

  it("keeps the original amber by default and recolors matches in place", () => {
    const { registry, entries } = fakeRegistry();
    const keywords = new KeywordHighlighter(document, registry, factory);
    keywords.render(["tsa"]);
    const style = () => document.getElementById("lw-keyword-style")!.textContent!;
    expect(style()).toContain("rgba(240, 180, 20, 0.32)");
    const ranges = entries.get(KEYWORD_HIGHLIGHT)!.ranges;
    const before = document.body.innerHTML;
    keywords.setColor("green");
    expect(style()).toContain(HIGHLIGHT_SHADES.green.fill);
    expect(style()).toContain("dotted");
    expect(entries.get(KEYWORD_HIGHLIGHT)!.ranges).toBe(ranges);
    expect(document.body.innerHTML).toBe(before);
  });
});
