// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { compactText, locateSignals, type SignalTarget } from "./signalRanges";

function setPage(): void {
  document.body.innerHTML = `
    <main role="main">
      <section><h1>Jordan Rivera</h1></section>
      <section><h2>About</h2><p>I love Python and teamwork.</p></section>
      <section><h2>Experience</h2><ul><li>
        <p>Web Team Lead</p>
        <p><span>• Led a 4-person web team<br><br>• Reached 300+ visitors through the site</span>
          <button aria-hidden="true">… more</button></p>
      </li></ul></section>
      <section><h2>People you may know</h2><p>Sam Lee · Python developer · Led a 4-person web team</p></section>
    </main>
  `;
}

function target(overrides: Partial<SignalTarget> = {}): SignalTarget {
  return { key: "a", section: "experience", quote: "Led a 4-person web team", metrics: ["4-person"], ...overrides };
}

describe("compactText", () => {
  it("ignores whitespace, case, and dash variants", () => {
    expect(compactText("Led  a 4–Person\nteam")).toBe(compactText("led a 4-person team"));
  });
});

describe("locateSignals", () => {
  it("finds the quote and its metric inside the owning section", () => {
    setPage();
    const located = locateSignals(document, [target()]).get("a")!;
    expect(located.quote.toString()).toBe("Led a 4-person web team");
    expect(located.metrics.map((r) => r.toString())).toEqual(["4-person"]);
    expect(located.quote.startContainer.parentElement!.closest("section")!.querySelector("h2")!.textContent).toBe("Experience");
  });

  it("matches across a line break boundary", () => {
    setPage();
    const located = locateSignals(document, [target({ quote: "web team • Reached 300+ visitors", metrics: ["300+"] })]).get("a")!;
    expect(located.quote.toString()).toContain("Reached 300+ visitors");
    expect(located.metrics[0]!.toString()).toBe("300+");
  });

  it("never highlights the same text in an unrelated sidebar section", () => {
    setPage();
    const located = locateSignals(document, [target({ section: "about", quote: "Led a 4-person web team" })]);
    expect(located.size).toBe(0);
  });

  it("only searches the named section", () => {
    setPage();
    const located = locateSignals(document, [target({ key: "p", section: "about", quote: "Python", metrics: [] })]).get("p")!;
    expect(located.quote.startContainer.parentElement!.closest("section")!.querySelector("h2")!.textContent).toBe("About");
  });

  it("ignores control text like the '… more' button", () => {
    setPage();
    expect(locateSignals(document, [target({ quote: "visitors through the site … more" })]).size).toBe(0);
  });

  it("skips a metric that is not inside the quote", () => {
    setPage();
    expect(locateSignals(document, [target({ metrics: ["300+"] })]).get("a")!.metrics).toEqual([]);
  });

  it("skips sections that are absent or not highlightable", () => {
    setPage();
    expect(locateSignals(document, [target({ section: "projects" }), target({ key: "h", section: "headline" })]).size).toBe(0);
  });
});

describe("locateSignals - titles are never highlighted", () => {
  function setEntryPage(): void {
    document.body.innerHTML = `
      <style>.x1 { font-weight: 600; } .x2 { font-weight: 400; }</style>
      <main role="main">
        <section><h1>Jordan Rivera</h1></section>
        <section><h2>Experience</h2><ul><li>
          <a href="#"><div><p class="x1">Competitor | Team Captain for Webmaster Event</p><p class="x2">Nov 2025 - Feb 2026</p></div></a>
          <p class="x2"><span data-testid="expandable-text-box">• Led a 4-person Webmaster team<br>• Reached 300+ visitors</span></p>
          <a href="#"><p class="x1">Robotics Club</p></a>
        </li></ul></section>
        <section><h2>Honors &amp; awards</h2>
          <p class="x1">3rd Place - Webmaster, State Conference</p>
          <p class="x2"><span data-testid="expandable-text-box">Earned 3rd Place - Webmaster, State Conference with a site for local families</span></p>
        </section>
      </main>
    `;
  }

  function find(section: string, quote: string, metrics: string[] = []) {
    return locateSignals(document, [{ key: "k", section, quote, metrics }]).get("k");
  }

  it("does not highlight a job title", () => {
    setEntryPage();
    expect(find("experience", "Competitor | Team Captain for Webmaster Event")).toBeUndefined();
  });

  it("does not highlight part of a role title", () => {
    setEntryPage();
    expect(find("experience", "Team Captain")).toBeUndefined();
  });

  it("does not highlight an organization name", () => {
    setEntryPage();
    expect(find("experience", "Robotics Club")).toBeUndefined();
  });

  it("does not highlight a section heading", () => {
    setEntryPage();
    expect(find("experience", "Experience")).toBeUndefined();
  });

  it("does not highlight an award title but does highlight the same words in its description", () => {
    setEntryPage();
    const located = find("honors", "3rd Place - Webmaster, State Conference")!;
    expect(located.quote.startContainer.parentElement!.getAttribute("data-testid")).toBe("expandable-text-box");
  });

  it("does not highlight a quote that runs from a title into its description", () => {
    setEntryPage();
    expect(find("experience", "Nov 2025 - Feb 2026 • Led a 4-person")).toBeUndefined();
  });

  it("still highlights description evidence and its metrics", () => {
    setEntryPage();
    const located = find("experience", "Led a 4-person Webmaster team", ["4-person"])!;
    expect(located.quote.toString()).toBe("Led a 4-person Webmaster team");
    expect(located.metrics.map((r) => r.toString())).toEqual(["4-person"]);
    expect(find("experience", "Reached 300+ visitors", ["300+"])!.metrics[0]!.toString()).toBe("300+");
  });
});
