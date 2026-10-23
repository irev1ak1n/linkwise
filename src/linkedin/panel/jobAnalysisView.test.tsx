import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { JobAnalysisView } from "./JobAnalyzerTab";
import { buildJobAnalysis, plainSummary } from "../../jobs/jobAnalysis";
import type { Goal } from "../../models/goal";
import type { JobAiFindings, JobPosting } from "../../jobs/jobTypes";

const posting: JobPosting = {
  jobId: "1", url: "", title: "Software Engineering Intern", company: "Acme", companyText: "",
  headerLines: ["Pittsburgh, PA · 2 days ago", "Hybrid", "Internship"],
  description: "Pay range: $28/hr - $31/hr.\nResponsibilities\n• Build and test internal tools with senior engineers\nMinimum Qualifications\n• Must be authorized to work in the United States",
};
const goal = { id: "g", name: "Dev internships", criteria: [{ id: "c1", label: "Software development", importance: "MUST_HAVE" }, { id: "c2", label: "Remote", importance: "PREFERRED" }] } as Goal;
const ai = (over: Partial<JobAiFindings> = {}): JobAiFindings => ({
  summary: "This is a hybrid software engineering internship in Pittsburgh that pays $28 to $31 an hour. You would build and test internal tools alongside senior engineers.",
  responsibilities: [], required: [], preferred: [], technicalSkills: [], professionalSkills: [], education: [], experience: [], restrictions: [], benefits: [],
  company: { industry: "", size: "", headquarters: "", focus: "", focusEvidence: "" },
  keyEvidence: [{ text: "You would work directly with senior engineers.", evidence: "senior engineers" }],
  criteria: [{ criterionId: "c1", status: "strong", reasoning: "The role is hands-on building and testing of internal tools, which is the development work you asked for.", evidence: "Build and test internal tools" }, { criterionId: "c2", status: "none", reasoning: "The listing says hybrid.", evidence: "Hybrid" }],
  ...over,
});

describe("job analysis view", () => {
  it("reads like the Profile Analyzer's dashboard: match card, summary, why it matches, key evidence, and nothing else", () => {
    const html = renderToStaticMarkup(<JobAnalysisView analysis={buildJobAnalysis(posting, ai(), goal)} hasCriteria />);
    expect(html).toContain("lw-an-score");
    for (const title of ["Summary", "Why it matches", "Key evidence"]) expect(html).toContain(`>${title}<`);
    expect(html).toContain("This is a hybrid software engineering internship");
    expect(html).toContain("which is the development work you asked for");
    // The unmet criterion is not listed as a reason, and no separate missing-information block exists.
    expect(html).not.toContain("The listing says hybrid.");
    expect(html).not.toMatch(/Missing/i);
    expect(html).toContain("Pays $28–$31/hour.");
  });

  it("builds a readable summary from the posting alone when there is no AI summary", () => {
    const analysis = buildJobAnalysis(posting, null, null);
    expect(analysis.summary).toBe(plainSummary(analysis));
    expect(analysis.summary).toContain("Software Engineering Intern at Acme");
    expect(analysis.summary).toContain("It pays $28–$31/hour.");
    const html = renderToStaticMarkup(<JobAnalysisView analysis={analysis} hasCriteria={false} />);
    expect(html).not.toContain("lw-an-score");
    expect(html).not.toContain("Why it matches");
  });
});
