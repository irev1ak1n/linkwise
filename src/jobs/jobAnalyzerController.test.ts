import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobAnalyzerController, clearJobFindingsCache, type JobAnalyzerDeps } from "./jobAnalyzerController";
import type { JobAnalysisRequestBody, JobAiOutcome } from "./jobAnalysisClient";
import type { JobAiFindings, JobPosting } from "./jobTypes";
import type { Goal } from "../models/goal";

const empty: JobAiFindings = { responsibilities: [], required: [], preferred: [], technicalSkills: [], professionalSkills: [], education: [], experience: [], restrictions: [], benefits: [], company: { industry: "", size: "", headquarters: "", focus: "", focusEvidence: "" }, keyEvidence: [], criteria: [] };
const goal: Goal = { id: "g", name: "Dev", criteria: [{ id: "c1", label: "Software development", importance: "MUST_HAVE" }] } as Goal;

const posting = (jobId: string, description = `Pay: $20 per hour. Build software for ${jobId}.`): JobPosting => ({ jobId, url: "", title: `Job ${jobId}`, company: "Acme", headerLines: ["Boston, MA · 1 day ago", "Hybrid"], description, companyText: "" });

function harness(initial: string | null = "1") {
  const page = { id: initial as string | null, descriptions: {} as Record<string, string>, expansions: 0 };
  const pending: { body: JobAnalysisRequestBody; resolve: (o: JobAiOutcome) => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  const highlights: (string | null)[] = [];
  const deps: JobAnalyzerDeps = {
    currentJobId: () => page.id,
    expand: () => (page.expansions += 1),
    read: () => (page.id ? posting(page.id, page.descriptions[page.id]) : null),
    analyze: (body) => {
      const cancel = vi.fn();
      const promise = new Promise<JobAiOutcome>((resolve) => pending.push({ body, resolve, cancel }));
      return { requestId: "r", promise, cancel };
    },
    highlight: (analysis) => highlights.push(analysis?.jobId ?? null),
    wait: () => Promise.resolve(),
  };
  const controller = new JobAnalyzerController(deps, goal);
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  return { controller, page, pending, highlights, flush };
}

const ok = (jobId: string, over: Partial<JobAiFindings> = {}): JobAiOutcome => ({ status: "ok", jobId, findings: { ...empty, ...over } });

beforeEach(() => clearJobFindingsCache());

describe("job analyzer", () => {
  it("opens collapsed sections first, then analyzes the whole posting exactly once however often the page changes", async () => {
    const { controller, page, pending, flush } = harness("1");
    for (let i = 0; i < 25; i++) controller.check();
    await flush();
    expect(page.expansions).toBeGreaterThan(0);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.body.job.description).toContain("Pay: $20 per hour");
    expect(pending[0]!.body.criteria).toEqual([{ id: "c1", label: "Software development", importance: "MUST_HAVE" }]);
    // What the posting states plainly is already showing while the AI reading is on its way.
    const early = controller.getState();
    expect(early.status).toBe("analyzing");
    pending[0]!.resolve(ok("1", { criteria: [{ criterionId: "c1", status: "strong", reasoning: "Builds software.", evidence: "Build software for 1" }] }));
    await flush();
    const state = controller.getState();
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.analysis.compensation).toMatchObject({ min: 20, period: "hour" });
      expect(state.analysis.overallMatch.score).toBe(100);
    }
    for (let i = 0; i < 10; i++) controller.check();
    await flush();
    expect(pending).toHaveLength(1);
  });

  it("waits for a description that is still growing before it analyzes", async () => {
    const { controller, page, pending, flush } = harness("1");
    let reads = 0;
    const read = vi.spyOn(page, "descriptions", "get").mockImplementation(() => ({ "1": ++reads < 3 ? `Short ${reads}` : "Full description of the job. Pay: $20 per hour." }) as Record<string, string>);
    controller.check();
    await flush();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.body.job.description).toBe("Full description of the job. Pay: $20 per hour.");
    read.mockRestore();
  });

  it("clears the previous job when another is selected, and never lets its late result replace the new one", async () => {
    const { controller, page, pending, highlights, flush } = harness("1");
    controller.check();
    await flush();
    page.id = "2";
    controller.check();
    expect(controller.getState()).toEqual({ status: "reading", jobId: "2" });
    expect(highlights.at(-1)).toBeNull();
    expect(pending[0]!.cancel).toHaveBeenCalled();
    await flush();
    expect(pending).toHaveLength(2);
    // The first job's answer arrives late.
    pending[0]!.resolve(ok("1"));
    await flush();
    expect(controller.getState()).toMatchObject({ status: "analyzing", jobId: "2" });
    pending[1]!.resolve(ok("2"));
    await flush();
    expect(controller.getState()).toMatchObject({ status: "ready", jobId: "2" });
  });

  it("reuses a job's reading when it is selected again, with no new request", async () => {
    const { controller, page, pending, flush } = harness("1");
    controller.check();
    await flush();
    pending[0]!.resolve(ok("1"));
    await flush();
    page.id = "2";
    controller.check();
    await flush();
    pending[1]!.resolve(ok("2"));
    await flush();
    page.id = "1";
    controller.check();
    await flush();
    expect(pending).toHaveLength(2);
    expect(controller.getState()).toMatchObject({ status: "ready", jobId: "1" });
  });

  it("shows what the posting states even when the AI reading fails, and says there is no job off job pages", async () => {
    const { controller, page, pending, flush } = harness("1");
    controller.check();
    await flush();
    pending[0]!.resolve({ status: "unavailable", reason: "network_error" });
    await flush();
    const state = controller.getState();
    expect(state).toMatchObject({ status: "ready", aiError: "network_error" });
    if (state.status === "ready") {
      expect(state.analysis.aiAvailable).toBe(false);
      expect(state.analysis.criteriaMatches[0]!.status).toBe("unknown");
    }
    page.id = null;
    controller.check();
    expect(controller.getState()).toEqual({ status: "no_job" });
  });

  it("judges the same posting again, once, when the criteria change", async () => {
    const { controller, pending, flush } = harness("1");
    controller.check();
    await flush();
    pending[0]!.resolve(ok("1"));
    await flush();
    controller.setGoal(goal);
    await flush();
    expect(pending).toHaveLength(1);
    controller.setGoal({ ...goal, criteria: [{ id: "c2", label: "Remote", importance: "PREFERRED" }] } as Goal);
    await flush();
    expect(pending).toHaveLength(2);
    expect(pending[1]!.body.criteria[0]!.label).toBe("Remote");
  });
});
