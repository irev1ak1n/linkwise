// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnalysisView } from "./AnalysisView";
import { openAnalyzerPage, syncAnalyzerProfile, getAnalyzerPage } from "./analyzerNav";
import { criteriaBreakdown, evidenceGroups, firstSentences, focusExcerpt } from "./analysisDetails";
import { scoreProfileAgainstGoal } from "../../matching/scoreProfile";
import { EMPTY_PROFILE, type LinkedInProfile } from "../../models/profile";
import type { Goal } from "../../models/goal";
import type { AiNarrativeDTO } from "../../ai/apiTypes";
import type { AiAnalysisState } from "./useAiAnalysis";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const goal: Goal = {
  id: "g1",
  name: "Multilingual developers",
  description: "Developers who speak several languages",
  criteria: [
    { id: "c1", label: "Software development", importance: "MUST_HAVE", category: "skill" },
    { id: "c2", label: "Speaks multiple languages", importance: "PREFERRED", category: "language" },
  ],
};

const profile: LinkedInProfile = {
  ...EMPTY_PROFILE,
  name: "Jordan Rivera",
  headline: "Software development student",
  experience: [{ title: "Website Developer", company: "Robotics Club", description: "Built the club website in React" }],
  languages: [{ name: "English" }, { name: "Spanish" }],
  extracted: true,
};

const strengths = ["Builds websites", "Uses React", "Bilingual", "Club leadership", "Self-taught"].map((title, i) => ({
  title,
  explanation: `Detail ${i}.`,
  evidenceIds: i === 0 ? ["experience:0", "made-up:9"] : i === 2 ? ["languages:0", "languages:1"] : [],
}));

const narrative: AiNarrativeDTO = {
  summary: "Jordan builds websites with React. Jordan speaks English and Spanish. Jordan leads a club. Jordan is a student.",
  strengths,
  gaps: ["No internship", "No degree", "No portfolio"].map((title) => ({ title, explanation: `${title} found.`, importance: "PREFERRED" as const, evidenceIds: [] })),
  experienceAssessment: "developing",
  experienceAssessmentReason: "Student-level experience.",
  recommendationReason: "Meets the must-have with direct website work. Worth a closer look.",
  contactRecommendationReason: "",
  saveRecommendationReason: "",
  confidenceLevel: "high",
};

const result = scoreProfileAgainstGoal(goal, profile);
const ready: AiAnalysisState = { status: "ready", outcome: { status: "ok", model: "m", result, narrative } };

let root: Root | null = null;
let container: HTMLElement;
const sendMessage = vi.fn();

function render(onRetry = vi.fn()) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<AnalysisView result={result} goal={goal} profile={profile} aiState={ready as Extract<AiAnalysisState, { status: "ready" }>} onRetry={onRetry} />));
  return onRetry;
}

const click = (text: string) => {
  const target = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!target) throw new Error(`No button "${text}"`);
  act(() => target.click());
};

beforeEach(() => {
  vi.stubGlobal("chrome", { runtime: { id: "test", sendMessage } });
  sendMessage.mockClear();
  openAnalyzerPage("home");
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Profile Analyzer dashboard", () => {
  it("shows a compact result with only the top reasons and gaps", () => {
    render();
    const text = container.textContent!;
    expect(container.querySelector(".lw-an-score__value")).not.toBeNull();
    expect(text).toContain("AI-enhanced analysis · High confidence");
    expect(container.querySelectorAll(".lw-an-points li.is-good")).toHaveLength(3);
    expect(container.querySelectorAll(".lw-an-points li.is-gap")).toHaveLength(2);
    expect(text).toContain("View all 5");
    expect(text).toContain("View all 3");
    expect(text).not.toContain("Self-taught");
    expect(container.querySelector(".lw-an-summary")!.textContent).toBe("Jordan builds websites with React. Jordan speaks English and Spanish. Jordan leads a club.");
  });

  it("keeps Smart Highlights and invented actions off the page", () => {
    render();
    const text = container.textContent!;
    for (const absent of ["Signal Mode", "High-signal facts", "Highlight keywords", "Save:", "Contact:"]) expect(text).not.toContain(absent);
  });

  it("opens Full analysis and Evidence, and Back returns to the dashboard, without asking for anything", () => {
    const onRetry = render();
    click("Full analysis");
    expect(getAnalyzerPage()).toBe("full");
    expect(container.textContent).toContain("Criteria breakdown");
    expect(container.textContent).toContain("Self-taught");
    expect(container.querySelector(".lw-an-score__value")).toBeNull();
    click("← Profile Analyzer");
    expect(container.querySelector(".lw-an-score__value")).not.toBeNull();
    click("Evidence");
    expect(container.textContent).toContain("Built the club website in React");
    click("← Profile Analyzer");
    expect(getAnalyzerPage()).toBe("home");
    expect(onRetry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the open page across re-renders, and resets it only for a different profile", () => {
    syncAnalyzerProfile("jordan");
    render();
    click("Evidence");
    act(() => root!.render(<AnalysisView result={result} goal={goal} profile={{ ...profile }} aiState={ready as Extract<AiAnalysisState, { status: "ready" }>} />));
    expect(getAnalyzerPage()).toBe("evidence");
    syncAnalyzerProfile("jordan");
    expect(getAnalyzerPage()).toBe("evidence");
    syncAnalyzerProfile("someone-else");
    expect(getAnalyzerPage()).toBe("home");
  });
});

describe("analysis details", () => {
  it("cuts a summary to whole sentences", () => {
    expect(firstSentences("One. Two! Three? Four.", 2)).toBe("One. Two!");
    expect(firstSentences("No ending punctuation", 3)).toBe("No ending punctuation");
  });

  it("explains every criterion from the result that produced the score", () => {
    const rows = criteriaBreakdown(goal, result);
    expect(rows.map((r) => r.label)).toEqual(["Software development", "Speaks multiple languages"]);
    expect(rows[0]).toMatchObject({ importance: "Must have" });
    expect(rows.every((r) => r.assessment.length > 0)).toBe(true);
  });

  it("shows only real profile text as evidence, dropping citations that don't exist", () => {
    const groups = evidenceGroups(profile, result, narrative);
    expect(groups.map((g) => g.title)).toEqual(["Builds websites", "Bilingual"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["experience:0"]);
    expect(groups[1].items.map((i) => i.text)).toEqual(["English", "Spanish"]);
  });

  it("quotes the part of a long text that supports the reason, unchanged", () => {
    const text =
      "SUMMARY-Experienced manager leading teams for many years-Strategic planner who communicates well with every stakeholder involved-Coordinated the engineering academy program at the school-Lead Advisor for the school Technology Student Association-Robotics lab manager and long-time coach of several teams";
    const excerpt = focusExcerpt(text, "Direct TSA leadership He advised a Technology Student Association chapter.");
    expect(excerpt).toBe("Lead Advisor for the school Technology Student Association");
    expect(text).toContain(excerpt);
    expect(focusExcerpt("Short text stays whole.", "anything")).toBe("Short text stays whole.");
  });

  it("falls back to each matched criterion's own snippet without AI citations", () => {
    const groups = evidenceGroups(profile, result);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) for (const item of group.items) for (const part of item.text.split(", ")) expect(JSON.stringify(profile)).toContain(part.slice(0, 20));
  });
});
