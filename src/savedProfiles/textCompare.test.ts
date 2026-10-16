import { describe, expect, it } from "vitest";
import { compareMetrics, compareText, extractMetrics } from "./textCompare";

describe("compareText", () => {
  it("ignores punctuation, case and whitespace", () => {
    expect(compareText("Built a website, serving 300+ students.", "built a website   serving 300+ students")).toEqual({ verdict: "same" });
  });

  it("ignores reordered bullets and sentences", () => {
    expect(compareText("• Led the team\n• Built the site", "• Built the site\n• Led the team")).toEqual({ verdict: "same" });
    expect(compareText("Led the team. Built the site.", "Built the site. Led the team.")).toEqual({ verdict: "same" });
  });

  it("ignores spelling cleanup", () => {
    expect(compareText("Managed the robotcs programm", "Managed the robotics program")).toEqual({ verdict: "same" });
  });

  it("ignores LinkedIn's elapsed duration counters", () => {
    expect(compareText("Jan 2026 - Present · 8 mos", "Jan 2026 - Present · 9 mos")).toEqual({ verdict: "same" });
    expect(compareText("2024 - Present · 1 yr 11 mos", "2024 - Present · 2 yrs")).toEqual({ verdict: "same" });
  });

  it("treats a clamped copy of the same text as unchanged", () => {
    expect(compareText("Built the staff dashboard and trained six advisers to use it", "Built the staff dashboard and trained")).toEqual({ verdict: "same" });
  });

  it("leaves a paraphrase with the same numbers to the semantic check", () => {
    const verdict = compareText("Built a website serving 300+ students", "Designed a website used by more than 300 students");
    expect(verdict).toEqual({ verdict: "different", metrics: [], wordingChanged: true });
  });

  it("detects a metric that grew", () => {
    const verdict = compareText("Built a website serving 300+ students", "Built a website serving 1,000+ students");
    expect(verdict.verdict).toBe("different");
    if (verdict.verdict !== "different") return;
    expect(verdict.wordingChanged).toBe(false);
    expect(verdict.metrics).toMatchObject([{ previous: { value: 300 }, current: { value: 1000 }, significance: "major", direction: "improved" }]);
  });

  it("marks text that continues the previous copy as extended", () => {
    expect(compareText("Built a staff dashboard", "Built a staff dashboard allowing advisers to independently manage student content").verdict).toBe("extended");
  });
});

describe("metrics", () => {
  it("reads numbers with their units and skips years", () => {
    expect(extractMetrics("Since 2019, reached 1.5k users and raised $10,000 with 95% retention")).toMatchObject([
      { value: 1500, unit: "users" },
      { value: 10000, unit: "$" },
      { value: 95, unit: "%" },
    ]);
  });

  it("treats small drifts as minor and large ones as major", () => {
    const [small] = compareMetrics(extractMetrics("300 students"), extractMetrics("310 students"));
    expect(small!.significance).toBe("minor");
    const [drop] = compareMetrics(extractMetrics("1,000 users"), extractMetrics("400 users"));
    expect(drop).toMatchObject({ significance: "major", direction: "weaker" });
  });

  it("reads '300+' and 'more than 300' as the same number", () => {
    expect(compareMetrics(extractMetrics("300+ students"), extractMetrics("more than 300 students"))).toEqual([]);
  });
});
