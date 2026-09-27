// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
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

describe("locateSignals - detail pages", () => {
  function setEducationDetails(): void {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/education/", configurable: true });
    document.body.innerHTML = `
      <style>.b { font-weight: 600; }</style>
      <main role="main">
        <div><p class="b">Jordan Rivera</p><p>Aspiring engineer with 9 years of practice</p></div>
        <div data-testid="profile_EducationDetailsSection_jordan">
          <p class="b">Education</p>
          <div>
            <div><a href="#"><p class="b">State Academy</p><p>Software Engineering</p></a><p>Over 9 years, I built skills in Python and C++</p></div>
            <hr role="presentation">
            <div><a href="#"><p class="b">City High School</p></a><p>Admitted at age 13 after ranking first</p></div>
          </div>
        </div>
        <section><h2>People you may know</h2><p>Over 9 years, I built skills in Python and C++</p></section>
      </main>
    `;
  }

  afterEach(() => {
    Object.defineProperty(document, "URL", { value: "http://localhost/", configurable: true });
  });

  function find(section: string, quote: string, metrics: string[] = []) {
    return locateSignals(document, [{ key: "k", section, quote, metrics }]).get("k");
  }

  it("highlights description evidence inside the page's own section", () => {
    setEducationDetails();
    const located = find("education", "Over 9 years, I built skills in Python and C++", ["9 years"])!;
    expect(located.quote.startContainer.parentElement!.closest('[data-testid*="DetailsSection"]')).not.toBeNull();
    expect(located.metrics.map((r) => r.toString())).toEqual(["9 years"]);
  });

  it("never highlights the school name or the section heading", () => {
    setEducationDetails();
    expect(find("education", "State Academy")).toBeUndefined();
    expect(find("education", "Education")).toBeUndefined();
  });

  it("ignores signals from other sections and text outside the section", () => {
    setEducationDetails();
    expect(find("about", "Aspiring engineer with 9 years of practice")).toBeUndefined();
    expect(find("experience", "Admitted at age 13 after ranking first")).toBeUndefined();
  });

  it("highlights any entry when each entry is wrapped with its own separator", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/experience/", configurable: true });
    document.body.innerHTML = `
      <main role="main">
        <div componentkey="com.linkedin.sdui.profile.card.refABC"><div>
          <div><p>Experience</p></div>
          <div><p>Web Lead</p><p>Built the school website</p></div>
          <div><hr role="presentation"><div><p>Tutor</p><p>Completed 200+ hours of tutoring</p></div></div>
          <div><hr role="presentation"><div><p>Volunteer</p><p>Edited videos for 80+ children</p></div></div>
        </div></div>
      </main>
    `;
    expect(find("experience", "Completed 200+ hours of tutoring")).toBeDefined();
    expect(find("experience", "Built the school website")).toBeDefined();
  });
});
