// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isJobCardApplied, isJobCardSaved, isJobCardViewed } from "./jobStateDetector";

function buildCard(html: string): HTMLElement {
  const li = document.createElement("li");
  li.innerHTML = html;
  return li;
}

describe("isJobCardApplied", () => {
  it("recognizes the real footer-job-state 'Applied' badge", () => {
    const card = buildCard(`<li class="job-card-container__footer-item job-card-container__footer-job-state t-bold">Applied</li>`);
    expect(isJobCardApplied(card)).toBe(true);
  });

  it("recognizes 'Applied 2d ago' as still applied", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state">Applied 2d ago</li>`);
    expect(isJobCardApplied(card)).toBe(true);
  });

  it("does not treat 'Viewed' as applied", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state">Viewed</li>`);
    expect(isJobCardApplied(card)).toBe(false);
  });

  it("does not treat 'Promoted' as applied", () => {
    const card = buildCard(`<li class="job-card-container__footer-item">Promoted</li>`);
    expect(isJobCardApplied(card)).toBe(false);
  });

  it("recognizes an aria-label starting with Applied", () => {
    const card = buildCard(`<span aria-label="Applied on Sep 20, 2026">icon</span>`);
    expect(isJobCardApplied(card)).toBe(true);
  });

  it("ignores 'applied' appearing mid-sentence elsewhere in the card", () => {
    const card = buildCard(`<a href="/jobs/view/1/">We recently applied a new benefits package</a>`);
    expect(isJobCardApplied(card)).toBe(false);
  });

  it("returns false for a plain card with no state at all", () => {
    const card = buildCard(`<a href="/jobs/view/1/">Software Engineer</a>`);
    expect(isJobCardApplied(card)).toBe(false);
  });
});

describe("isJobCardViewed", () => {
  it("recognizes the real footer-job-state 'Viewed' badge", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state t-bold">Viewed</li>`);
    expect(isJobCardViewed(card)).toBe(true);
  });

  it("does not treat 'Applied' as viewed", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state">Applied</li>`);
    expect(isJobCardViewed(card)).toBe(false);
  });

  it("does not treat 'Promoted' as viewed", () => {
    const card = buildCard(`<li class="job-card-container__footer-item">Promoted</li>`);
    expect(isJobCardViewed(card)).toBe(false);
  });

  it("ignores 'viewed' appearing mid-sentence elsewhere in the card", () => {
    const card = buildCard(`<a href="/jobs/view/1/">Viewed by 200 applicants</a>`);
    expect(isJobCardViewed(card)).toBe(false);
  });

  it("returns false for a plain card with no state at all", () => {
    const card = buildCard(`<a href="/jobs/view/1/">Software Engineer</a>`);
    expect(isJobCardViewed(card)).toBe(false);
  });
});

describe("isJobCardSaved", () => {
  it("recognizes the real footer-job-state 'Saved' badge", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state t-bold">Saved</li>`);
    expect(isJobCardSaved(card)).toBe(true);
  });

  it("does not treat 'Applied' as saved", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state">Applied</li>`);
    expect(isJobCardSaved(card)).toBe(false);
  });

  it("does not treat 'Viewed' as saved", () => {
    const card = buildCard(`<li class="job-card-container__footer-job-state">Viewed</li>`);
    expect(isJobCardSaved(card)).toBe(false);
  });

  it("recognizes an aria-label starting with Saved", () => {
    const card = buildCard(`<button aria-label="Saved">icon</button>`);
    expect(isJobCardSaved(card)).toBe(true);
  });

  it("returns false for a plain card with no state at all", () => {
    const card = buildCard(`<a href="/jobs/view/1/">Software Engineer</a>`);
    expect(isJobCardSaved(card)).toBe(false);
  });
});

describe("new search-results layout", () => {
  it("recognizes a bare Viewed <p>", () => {
    const card = buildCard(`<p>Associate Engineer</p><p>Acme</p><p>Viewed</p>`);
    expect(isJobCardViewed(card)).toBe(true);
  });

  it("recognizes a bare Saved <p>", () => {
    expect(isJobCardSaved(buildCard(`<p>Engineer</p><p>Saved</p>`))).toBe(true);
  });

  it("does not mistake a title or company starting with the state word", () => {
    const card = buildCard(`<p>Applied Scientist</p><p>Applied Materials</p><p>Saved Search Co</p>`);
    expect(isJobCardApplied(card)).toBe(false);
    expect(isJobCardSaved(card)).toBe(false);
  });
});
