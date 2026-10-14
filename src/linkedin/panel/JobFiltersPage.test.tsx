import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobFiltersPage, activeJobRules } from "./JobFiltersPage";
import { DEFAULT_JOBS_SETTINGS, type JobsSettings } from "../../models/jobsSettings";
import { parseKeywords } from "../jobs/keywordMatcher";

function render(overrides: Partial<JobsSettings> = {}): string {
  return renderToStaticMarkup(<JobFiltersPage settings={{ ...DEFAULT_JOBS_SETTINGS, ...overrides }} onChange={() => {}} onBack={() => {}} />);
}

const pickers = (html: string) => [...html.matchAll(/role="radiogroup" aria-label="([^"]+ color)"/g)].map((m) => m[1]);

describe("JobFiltersPage", () => {
  it("renders every job setting with Back, as segmented controls", () => {
    const html = render();
    expect(html).toContain("← Back");
    expect(html).toContain("Job Filters");
    expect(html).toContain("Customize how LinkedIn job listings are hidden or highlighted.");
    for (const label of ["Applied jobs", "Viewed jobs", "Saved jobs", "Action"]) {
      expect(html).toContain(`role="radiogroup" aria-label="${label}"`);
    }
    expect(html.match(/role="radio" aria-checked="true"[^>]*>Do nothing</g)).toHaveLength(4);
    expect(html).toContain('aria-label="Keyword filters"');
    expect(html).toContain("Separate keywords with commas or new lines.");
    expect(html).toContain("Case-insensitive matching");
    expect(html).not.toContain('type="radio"');
  });

  it("shows no color choice while nothing is highlighted", () => {
    expect(pickers(render())).toEqual([]);
    expect(pickers(render({ appliedAction: "hide", viewedAction: "none", keywordAction: "hide" }))).toEqual([]);
  });

  it("shows a separate color choice for each rule set to Highlight", () => {
    expect(pickers(render({ appliedAction: "highlight" }))).toEqual(["Applied jobs color"]);
    expect(pickers(render({ viewedAction: "highlight", savedAction: "highlight", keywordAction: "highlight" }))).toEqual([
      "Viewed jobs color",
      "Saved jobs color",
      "Keyword filter color",
    ]);
  });

  it("marks each rule's own saved color", () => {
    const html = render({ appliedAction: "highlight", savedAction: "highlight", appliedColor: "coral", savedColor: "mint" });
    expect(html).toMatch(/aria-label="Applied jobs color">.*?aria-checked="true" aria-label="Coral"/);
    expect(html).toMatch(/aria-label="Saved jobs color">.*?aria-checked="true" aria-label="Mint"/);
  });

  it("summarizes only the active rules", () => {
    expect(activeJobRules(DEFAULT_JOBS_SETTINGS)).toEqual([]);
    expect(render()).not.toContain("Active filters");
    const settings = { ...DEFAULT_JOBS_SETTINGS, viewedAction: "hide" as const, savedAction: "highlight" as const, keywordsText: "Team\nSenior", keywordAction: "hide" as const };
    expect(activeJobRules(settings)).toEqual(["Hide viewed jobs", "Highlight saved jobs", 'Hide jobs containing "Team", "Senior"']);
  });

  it("keeps keywords that have no action out of the summary", () => {
    expect(activeJobRules({ ...DEFAULT_JOBS_SETTINGS, keywordsText: "Team" })).toEqual([]);
  });
});

describe("keyword parsing", () => {
  it("accepts commas and new lines", () => {
    expect(parseKeywords("Promoted, On-site\nSenior\n\n")).toEqual(["Promoted", "On-site", "Senior"]);
  });
});
