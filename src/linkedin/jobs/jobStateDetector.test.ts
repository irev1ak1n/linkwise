// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isJobCardApplied, isJobCardViewed } from "./jobStateDetector";

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
