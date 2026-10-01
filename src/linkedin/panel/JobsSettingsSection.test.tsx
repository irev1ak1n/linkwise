import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobsSettingsSection } from "./JobsSettingsSection";
import { DEFAULT_JOBS_SETTINGS, type JobsSettings } from "../../models/jobsSettings";

function render(overrides: Partial<JobsSettings> = {}): string {
  return renderToStaticMarkup(<JobsSettingsSection settings={{ ...DEFAULT_JOBS_SETTINGS, ...overrides }} onChange={() => {}} />);
}

const pickers = (html: string) => [...html.matchAll(/role="radiogroup" aria-label="([^"]+ color)"/g)].map((m) => m[1]);

describe("JobsSettingsSection color choices", () => {
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
});
