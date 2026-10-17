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

const open = (page: "full" | "evidence") => act(() => openAnalyzerPage(page));

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
  it("shows only the match, summary, and why they match", () => {
    render();
    const text = container.textContent!;
    expect(container.querySelector(".lw-an-score__value")).not.toBeNull();
    expect(text).toContain("High confidence");
    expect(text).not.toContain("AI-enhanced analysis ·");
    const order = ["lw-an-score", 'aria-label="Summary"', 'aria-label="Why they match"'].map((marker) => container.innerHTML.indexOf(marker));
    expect(order.every((index, i) => index > -1 && (i === 0 || index > order[i - 1]!))).toBe(true);
    expect(container.querySelectorAll(".lw-an-points li.is-good")).toHaveLength(3);
    expect(container.querySelector(".lw-an-points li.is-good span")!.textContent).toBe("Detail 0.");
    expect(container.querySelectorAll(".lw-an-points li.is-gap")).toHaveLength(0);
    expect(text).not.toContain("Self-taught");
    expect(container.querySelector(".lw-an-summary")!.textContent).toBe("Jordan builds websites with React. Jordan speaks English and Spanish. Jordan leads a club.");
  });

  it("keeps the recommendation and the Full analysis and Evidence links off the dashboard", () => {
    render();
    const text = container.textContent!;
    expect(container.querySelector('[aria-label="Recommendation"]')).toBeNull();
    expect(container.querySelector('[aria-label="Analysis details"]')).toBeNull();
    for (const absent of ["Recommendation", "Worth contacting", "Full analysis", "Evidence", "View all"]) expect(text).not.toContain(absent);
  });

  it("ends with Profile Highlights", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root!.render(<AnalysisView result={result} goal={goal} profile={profile} aiState={ready as Extract<AiAnalysisState, { status: "ready" }>} highlights={<section aria-label="Profile highlights">H</section>} />));
    const dashboard = container.querySelector(".lw-dash")!;
    expect(dashboard.lastElementChild!.getAttribute("aria-label")).toBe("Profile highlights");
    expect(container.innerHTML.indexOf('aria-label="Why they match"')).toBeLessThan(container.innerHTML.indexOf('aria-label="Profile highlights"'));
  });

  it("keeps Smart Highlights and invented actions off the page", () => {
    render();
    const text = container.textContent!;
    for (const absent of ["Signal Mode", "High-signal facts", "Highlight keywords", "Save:", "Contact:"]) expect(text).not.toContain(absent);
  });

  it("still opens Full analysis and Evidence by route, and Back returns to the dashboard, without asking for anything", () => {
    const onRetry = render();
    open("full");
    expect(getAnalyzerPage()).toBe("full");
    expect(container.textContent).toContain("Criteria breakdown");
    expect(container.querySelector(`[aria-label="What's missing"]`)!.textContent).toContain("No internship");
    expect(container.textContent).toContain("Self-taught");
    expect(container.querySelector(".lw-an-score__value")).toBeNull();
    click("← Back to Profile Analyzer");
    expect(container.querySelector(".lw-an-score__value")).not.toBeNull();
    open("evidence");
    expect(container.textContent).toContain("Built the club website in React");
    click("← Back to Profile Analyzer");
    expect(getAnalyzerPage()).toBe("home");
    expect(onRetry).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps the open page across re-renders, and resets it only for a different profile", () => {
    syncAnalyzerProfile("jordan");
    render();
    open("evidence");
    act(() => root!.render(<AnalysisView result={result} goal={goal} profile={{ ...profile }} aiState={ready as Extract<AiAnalysisState, { status: "ready" }>} />));
    expect(getAnalyzerPage()).toBe("evidence");
    syncAnalyzerProfile("jordan");
    expect(getAnalyzerPage()).toBe("evidence");
    syncAnalyzerProfile("someone-else");
    expect(getAnalyzerPage()).toBe("home");
  });
});

describe("Full analysis layout", () => {
  function openFull() {
    render();
    open("full");
  }

  it("gives each section its own role, in order", () => {
    openFull();
    const sections = [...container.querySelectorAll("section[aria-label]")].map((s) => [s.getAttribute("aria-label"), s.className]);
    expect(sections).toEqual([
      ["Summary", "lw-fa-summary"],
      ["Recommendation", "lw-fa-decision is-good"],
      ["Why they match", "lw-fa-list is-match"],
      ["What's missing", "lw-fa-list is-gap"],
      ["Experience", "lw-fa-experience"],
      ["Criteria breakdown", "lw-fa-criteria"],
    ]);
  });

  it("splits the recommendation into a decision", () => {
    openFull();
    const decision = container.querySelector(".lw-fa-decision")!;
    expect(decision.querySelector(".lw-fa-decision__headline")?.textContent).not.toContain("—");
  });

  it("shows the summary once, capped at four sentences", () => {
    openFull();
    const summary = container.querySelector(".lw-fa-summary p")!.textContent!;
    expect(summary).toBe(narrative.summary);
    expect(container.textContent!.split("Jordan builds websites with React.").length - 1).toBe(1);
  });

  it("keeps criteria collapsed until one is opened", () => {
    openFull();
    const rows = [...container.querySelectorAll<HTMLDetailsElement>(".lw-fa-criterion")];
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.open)).toBe(true);
    expect(rows[0].querySelector("summary")!.textContent).toContain("Software development");
    act(() => rows[0].querySelector("summary")!.click());
    expect(rows[0].open).toBe(true);
    expect(rows[1].open).toBe(false);
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

describe("recommendation wording", () => {
  it("drops a reason's opening echo of the decision", async () => {
    const { withoutLabelEcho } = await import("./AnalysisView");
    expect(withoutLabelEcho("Strong candidate. His TSA role fits.", "Strong candidate — worth contacting")).toBe("His TSA role fits.");
    expect(withoutLabelEcho("Worth contacting: strong fit.", "Strong candidate — worth contacting")).toBe("strong fit.");
    expect(withoutLabelEcho("His TSA role fits.", "Low priority")).toBe("His TSA role fits.");
  });
});
