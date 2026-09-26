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
