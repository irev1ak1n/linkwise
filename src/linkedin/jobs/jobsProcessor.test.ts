// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_JOBS_SETTINGS, type JobsSettings } from "../../models/jobsSettings";
import { processJobCards, restoreAllJobCards } from "./jobsProcessor";

function settings(overrides: Partial<JobsSettings>): JobsSettings {
  return { ...DEFAULT_JOBS_SETTINGS, ...overrides };
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function appliedCard(id: string, title: string): string {
  return `
    <li data-occludable-job-id="${id}">
      <a href="/jobs/view/${id}/" class="job-card-list__title--link"><span aria-hidden="true">${title}</span></a>
      <ul><li class="job-card-container__footer-job-state">Applied</li></ul>
    </li>
  `;
}

function plainCard(id: string, title: string): string {
  return `
    <li data-occludable-job-id="${id}">
      <a href="/jobs/view/${id}/" class="job-card-list__title--link"><span aria-hidden="true">${title}</span></a>
    </li>
  `;
}

describe("processJobCards", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("hides an applied job card when appliedAction is hide", () => {
    setBody(`<ul>${appliedCard("1", "Engineer")}</ul>`);
    processJobCards(document, settings({ appliedAction: "hide" }));
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
  });

  it("leaves a non-applied card untouched when appliedAction is hide", () => {
    setBody(`<ul>${plainCard("1", "Engineer")}</ul>`);
    processJobCards(document, settings({ appliedAction: "hide" }));
    const card = document.querySelector('[data-occludable-job-id="1"]');
    expect(card?.classList.contains("lw-job-hidden")).toBe(false);
    expect(card?.classList.contains("lw-job-highlight")).toBe(false);
  });

  it("highlights a keyword match", () => {
    setBody(`<ul>${plainCard("1", "Senior Java Engineer")}</ul>`);
    processJobCards(document, settings({ keywordsText: "senior", keywordAction: "highlight" }));
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-highlight")).toBe(true);
  });

  it("respects case-insensitive off, so different casing does not match", () => {
    setBody(`<ul>${plainCard("1", "Senior Java Engineer")}</ul>`);
    processJobCards(document, settings({ keywordsText: "SENIOR", keywordAction: "highlight", caseInsensitive: false }));
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-highlight")).toBe(false);
  });

  it("matches multiple keywords across different cards", () => {
    setBody(`<ul>${plainCard("1", "Staff Engineer")}${plainCard("2", "Contract Role")}${plainCard("3", "Junior Role")}</ul>`);
    processJobCards(document, settings({ keywordsText: "Staff, Contract", keywordAction: "hide" }));
    expect(document.querySelector('[data-occludable-job-id="1"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="2"]')?.classList.contains("lw-job-hidden")).toBe(true);
    expect(document.querySelector('[data-occludable-job-id="3"]')?.classList.contains("lw-job-hidden")).toBe(false);
  });

  it("does nothing when both actions are none", () => {
    setBody(`<ul>${appliedCard("1", "Senior Engineer")}</ul>`);
    processJobCards(document, settings({ keywordsText: "senior" }));
    const card = document.querySelector('[data-occludable-job-id="1"]');
    expect(card?.classList.contains("lw-job-hidden")).toBe(false);
    expect(card?.classList.contains("lw-job-highlight")).toBe(false);
  });

  it("reapplying with different settings updates the card instead of stacking classes", () => {
    setBody(`<ul>${appliedCard("1", "Engineer")}</ul>`);
    processJobCards(document, settings({ appliedAction: "hide" }));
    processJobCards(document, settings({ appliedAction: "highlight" }));
    const card = document.querySelector('[data-occludable-job-id="1"]');
    expect(card?.classList.contains("lw-job-hidden")).toBe(false);
    expect(card?.classList.contains("lw-job-highlight")).toBe(true);
  });
});

describe("restoreAllJobCards", () => {
  it("clears every LinkWise class from every card", () => {
    setBody(`<ul>${appliedCard("1", "A")}${plainCard("2", "B")}</ul>`);
    processJobCards(document, settings({ appliedAction: "hide", keywordsText: "B", keywordAction: "highlight" }));
    restoreAllJobCards(document);
    expect(document.querySelector('[data-occludable-job-id="1"]')?.className).toBe("");
    expect(document.querySelector('[data-occludable-job-id="2"]')?.className).toBe("");
  });
});
