// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_JOBS_SETTINGS, type JobsSettings } from "../../models/jobsSettings";
import { isJobsSearchPage, resetJobsRuntime, runJobsTick } from "./jobsRuntime";

function settings(overrides: Partial<JobsSettings>): JobsSettings {
  return { ...DEFAULT_JOBS_SETTINGS, ...overrides };
}

describe("isJobsSearchPage", () => {
  it("recognizes a jobs search url", () => {
    expect(isJobsSearchPage("https://www.linkedin.com/jobs/search/?keywords=engineer")).toBe(true);
  });

  it("recognizes a jobs collections url", () => {
    expect(isJobsSearchPage("https://www.linkedin.com/jobs/collections/recommended/")).toBe(true);
  });

  it("ignores a profile page", () => {
    expect(isJobsSearchPage("https://www.linkedin.com/in/someone/")).toBe(false);
  });

  it("ignores the jobs home page with no search", () => {
    expect(isJobsSearchPage("https://www.linkedin.com/jobs/")).toBe(false);
  });
});

describe("runJobsTick", () => {
  beforeEach(() => {
    resetJobsRuntime();
    document.body.innerHTML = "";
    document.head.innerHTML = "";
  });

  it("does nothing on a non-jobs page", () => {
    document.body.innerHTML = `<li data-occludable-job-id="1"><a href="/jobs/view/1/">A</a></li>`;
    runJobsTick("https://www.linkedin.com/feed/", settings({ appliedAction: "hide" }));
    expect(document.querySelector('[data-occludable-job-id="1"]')?.className).toBe("");
  });

  it("processes cards on a jobs search page", () => {
    document.body.innerHTML = `
      <li data-occludable-job-id="1">
        <a href="/jobs/view/1/"><span>A</span></a>
        <ul><li class="job-card-container__footer-job-state">Applied</li></ul>
      </li>
    `;
    runJobsTick("https://www.linkedin.com/jobs/search/", settings({ appliedAction: "hide" }));
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
  });

  it("restores then reapplies when settings change between ticks", () => {
    document.body.innerHTML = `
      <li data-occludable-job-id="1">
        <a href="/jobs/view/1/"><span>A</span></a>
        <ul><li class="job-card-container__footer-job-state">Applied</li></ul>
      </li>
    `;
    runJobsTick("https://www.linkedin.com/jobs/search/", settings({ appliedAction: "hide" }));
    runJobsTick("https://www.linkedin.com/jobs/search/", settings({ appliedAction: "highlight" }));
    const card = document.querySelector('[data-occludable-job-id="1"]');
    expect(card?.classList.contains("lw-job-hidden")).toBe(false);
    expect(card?.classList.contains("lw-job-highlight")).toBe(true);
  });

  it("reprocessing with the same settings object leaves unrelated classes alone", () => {
    document.body.innerHTML = `<li data-occludable-job-id="1"><a href="/jobs/view/1/"><span>A</span></a></li>`;
    const s = settings({ appliedAction: "hide" });
    runJobsTick("https://www.linkedin.com/jobs/search/", s);
    document.querySelector('[data-occludable-job-id="1"]')!.classList.add("linkedin-own-class");
    runJobsTick("https://www.linkedin.com/jobs/search/", s);
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("linkedin-own-class")).toBe(true);
  });
});
