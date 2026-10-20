import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NOT_OWN_PROFILE_MESSAGE, OptimizerView, ProfileScore, TopPriorities, topPriorities } from "./OptimizerView";
import { scoreBand } from "./score";
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

describe("overview layout", () => {
  const overview = () => {
    setProfileShell({ profileKey: "me", complete: true, shell: { isOwnProfile: true, hasPhoto: true, hasBanner: true, sections: {} } });
    const html = renderToStaticMarkup(<OptimizerView profileKey="me" profile={{ ...EMPTY_PROFILE, headline: "Student developer", extracted: true }} isFinal onAnalyzeNow={() => {}} />);
    setProfileShell(null);
    return html;
  };

  it("puts the score area first, then your context, then the grouped sections", () => {
    const html = overview();
    const score = html.indexOf("Reviewing your profile");
    const context = html.indexOf("Anything not on your LinkedIn profile?");
    const groups = html.indexOf('class="lw-opt-groups"');
    expect(score).toBeGreaterThan(-1);
    expect(score).toBeLessThan(context);
    expect(context).toBeLessThan(groups);
  });

  it("lists every section once, with no filters, collapsing, or second list", () => {
    const html = overview();
    expect(html.match(/class="lw-opt-card"/g)).toHaveLength(18);
    expect(html).not.toContain("radiogroup");
    expect(html).not.toMatch(/All \(|Show strong|Hide strong|Needs attention|Looking Good|Show more/i);
    expect(html).not.toContain("lw-optimizer__rows");
  });
});

describe("ProfileScore", () => {
  it("shows the score and the summary", () => {
    const html = renderToStaticMarkup(<ProfileScore state={ready} onRetry={() => {}} pageRead isFinal onAnalyzeNow={() => {}} />);
    expect(html).toContain(">72<");
    expect(html).toContain(">/ 100<");
    expect(html).toContain(">Profile score<");
    expect(html).toContain(">Good foundation<");
    expect(html.indexOf(">72<")).toBeLessThan(html.indexOf("A focused profile."));
    expect(html).not.toContain("Show full analysis");
  });

  it("keeps a long summary to its first sentences, with the rest a tap away", () => {
    const summary = "One. Two is here. Three! Four? Five. Six.";
    const html = renderToStaticMarkup(<ProfileScore state={{ ...ready, result: { ...ready.result, summary } }} onRetry={() => {}} pageRead isFinal onAnalyzeNow={() => {}} />);
    expect(html).toContain(">One. Two is here. Three! Four?<");
    expect(html).not.toContain("Five.");
    expect(html).toContain("Show full analysis");
  });

  it("labels the score band from the score alone", () => {
    expect([scoreBand(95), scoreBand(80), scoreBand(79), scoreBand(60), scoreBand(59), scoreBand(0)]).toEqual(["Strong profile", "Strong profile", "Good foundation", "Good foundation", "Needs improvement", "Needs improvement"]);
  });

  it("offers a retry when unavailable", () => {
    const html = renderToStaticMarkup(<ProfileScore state={{ status: "unavailable", reason: "timeout" }} onRetry={() => {}} pageRead isFinal onAnalyzeNow={() => {}} />);
    expect(html).toContain("Try again");
  });
});

describe("topPriorities", () => {
  const dto = (section: SectionAssessmentDTO["section"], state: SectionAssessmentDTO["state"], impact: SectionAssessmentDTO["impact"]): SectionAssessmentDTO => ({ section, state, impact, reason: "", sourceType: "linkedin_profile", evidenceIds: [], suggestions: [] });

  it("takes sections with something to do, highest impact first, at most three", () => {
    const top = topPriorities([dto("headline", "strong", "high"), dto("projects", "add", "low"), dto("about", "improve", "medium"), dto("featured", "add", "high"), dto("skills", "improve", "high"), dto("photo", "improve", "high")]);
    expect(top.map((t) => t.section)).toEqual(["featured", "skills", "photo"]);
  });

  it("is empty when every section is strong", () => {
    expect(topPriorities([dto("headline", "strong", "high")])).toEqual([]);
  });

  it("renders numbered rows that say what to do and how much it matters", () => {
    const html = renderToStaticMarkup(<TopPriorities sections={sections} />);
    expect(html).toContain(">Top priorities<");
    expect(html.match(/class="lw-opt-card"/g)).toHaveLength(2);
    expect(html.indexOf("Improve About")).toBeLessThan(html.indexOf("Add Projects"));
    expect(html).toContain(">High impact<");
    expect(renderToStaticMarkup(<TopPriorities sections={[sections[0]]} />)).toBe("");
  });
});
