// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findJobCards, isJobCardRendered } from "./jobCardDetector";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe("findJobCards", () => {
  it("detects a card via the real data-occludable-job-id layout", () => {
    setBody(`
      <ul>
        <li data-occludable-job-id="111">
          <div data-job-id="111">
            <a href="/jobs/view/111/?trk=x">Senior Engineer</a>
          </div>
        </li>
      </ul>
    `);
    const cards = findJobCards(document);
    expect(cards).toHaveLength(1);
    expect(cards[0].jobId).toBe("111");
  });

  it("falls back to data-job-id when the outer li has no occludable id", () => {
    setBody(`
      <div data-job-id="222">
        <a href="/jobs/view/222/">Engineer</a>
      </div>
    `);
    const cards = findJobCards(document);
    expect(cards).toHaveLength(1);
    expect(cards[0].jobId).toBe("222");
  });

  it("falls back to the closest li around a /jobs/view/ link with no data attributes at all", () => {
    setBody(`
      <ul>
        <li>
          <a href="/jobs/view/333/">Engineer</a>
        </li>
      </ul>
    `);
    const cards = findJobCards(document);
    expect(cards).toHaveLength(1);
    expect(cards[0].jobId).toBe("333");
  });

  it("falls back to a role=listitem ancestor when there is no li", () => {
    setBody(`
      <div role="listitem">
        <a href="/jobs/view/444/">Engineer</a>
      </div>
    `);
    const cards = findJobCards(document);
    expect(cards).toHaveLength(1);
    expect(cards[0].jobId).toBe("444");
  });

  it("never double-counts the same job across layers", () => {
    setBody(`
      <li data-occludable-job-id="555">
        <div data-job-id="555">
          <a href="/jobs/view/555/">Engineer</a>
        </div>
      </li>
    `);
    expect(findJobCards(document)).toHaveLength(1);
  });

  it("detects multiple distinct cards in one pass", () => {
    setBody(`
      <ul>
        <li data-occludable-job-id="1"><a href="/jobs/view/1/">A</a></li>
        <li data-occludable-job-id="2"><a href="/jobs/view/2/">B</a></li>
        <li data-occludable-job-id="3"><a href="/jobs/view/3/">C</a></li>
      </ul>
    `);
    expect(findJobCards(document)).toHaveLength(3);
  });

  it("returns nothing on a page with no job cards", () => {
    setBody(`<div>Not a jobs page</div>`);
    expect(findJobCards(document)).toEqual([]);
  });
});

describe("isJobCardRendered", () => {
  it("is false for a ghost placeholder with no title yet", () => {
    setBody(`<li data-occludable-job-id="1"><!----></li>`);
    const card = document.querySelector("li")!;
    expect(isJobCardRendered(card)).toBe(false);
  });

  it("is true once the title link has real text", () => {
    setBody(`<li data-occludable-job-id="1"><a href="/jobs/view/1/">Software Engineer</a></li>`);
    const card = document.querySelector("li")!;
    expect(isJobCardRendered(card)).toBe(true);
  });

  it("is false when the title link exists but is still empty", () => {
    setBody(`<li data-occludable-job-id="1"><a href="/jobs/view/1/"></a></li>`);
    const card = document.querySelector("li")!;
    expect(isJobCardRendered(card)).toBe(false);
  });
});
