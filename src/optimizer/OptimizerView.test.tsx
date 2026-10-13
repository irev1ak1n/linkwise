import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NOT_OWN_PROFILE_MESSAGE, OptimizerResult, OptimizerView, sortAssessments } from "./OptimizerView";
import { setProfileShell } from "./profileShellStore";
import { EMPTY_PROFILE } from "../models/profile";
import type { OptimizerReady } from "./optimizerController";
import type { SectionAssessmentDTO } from "./optimizerTypes";

const sections: SectionAssessmentDTO[] = [
  { section: "headline", state: "strong", impact: "low", reason: "Clear.", sourceType: "linkedin_profile", evidenceIds: ["headline:0"], suggestions: [] },
  { section: "projects", state: "add", impact: "medium", reason: "If you have projects, add them.", sourceType: "general_best_practice", evidenceIds: [], suggestions: [] },
  { section: "about", state: "improve", impact: "high", reason: "No result.", sourceType: "linkedin_profile", evidenceIds: ["about:0"], suggestions: [] },
];

const ready: OptimizerReady = {
  status: "ready",
  key: "k",
  profileKey: "me",
  body: { profile: { identity: "me", evidence: [] }, sections: [], userContext: "" },
  result: { summary: "A focused profile.", sections },
  score: 72,
};

describe("OptimizerView", () => {
  it("shows the own-profile message off a profile or on another person's profile", () => {
    const view = (profileKey: string | null) => renderToStaticMarkup(<OptimizerView profileKey={profileKey} profile={{ ...EMPTY_PROFILE }} isFinal onAnalyzeNow={() => {}} />);
    expect(view(null)).toContain(NOT_OWN_PROFILE_MESSAGE);
    setProfileShell({ profileKey: "someone", complete: true, shell: { isOwnProfile: false, hasPhoto: true, hasBanner: true, sections: {} } });
    expect(view("someone")).toContain(NOT_OWN_PROFILE_MESSAGE);
    setProfileShell({ profileKey: "me", complete: true, shell: { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} } });
    const own = view("me");
    expect(own).not.toContain(NOT_OWN_PROFILE_MESSAGE);
    expect(own).toContain("Anything not on your LinkedIn profile?");
    setProfileShell(null);
  });
});

describe("OptimizerResult", () => {
  it("shows the score, filter counts, and rows by priority", () => {
    const html = renderToStaticMarkup(<OptimizerResult state={ready} onRetry={() => {}} userContext="" />);
    expect(html).toContain(">72<");
    expect(html).toContain("All (3)");
    expect(html).toContain("Add (1)");
    expect(html).toContain("Improve (1)");
    expect(html).toContain("Strong (1)");
    expect(html.indexOf("About")).toBeLessThan(html.indexOf("Projects"));
    expect(html.indexOf("Projects")).toBeLessThan(html.indexOf("Headline"));
    expect(html).toContain("High impact");
  });

  it("puts strong sections last", () => {
    expect(sortAssessments(sections).map((s) => s.section)).toEqual(["about", "projects", "headline"]);
  });

  it("offers a retry when unavailable", () => {
    const html = renderToStaticMarkup(<OptimizerResult state={{ status: "unavailable", reason: "timeout" }} onRetry={() => {}} userContext="" />);
    expect(html).toContain("Try again");
  });
});
