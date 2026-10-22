// Watches which job LinkedIn is showing and analyzes it once. LinkedIn swaps the right-hand panel in
// place when another job is clicked, and its markup churns constantly, so nothing here reacts to a
// change itself: every trigger just asks check(), which decides from the job id whether there is
// anything new to do. A job is read only after its collapsed parts are open and its text has stopped
// growing, it is analyzed once, and a slow result for a job that is no longer open is thrown away.
import type { Goal } from "../models/goal";
import type { PendingRelayRequest } from "../ai/backgroundRelay";
import { hashString } from "../ai/aiAnalysisCache";
import { buildJobAnalysis } from "./jobAnalysis";
import type { JobAiOutcome, JobAnalysisRequestBody } from "./jobAnalysisClient";
import type { JobAiFindings, JobAnalysis, JobPosting } from "./jobTypes";

export type JobAnalyzerState =
  | { status: "idle" }
  | { status: "no_job" }
  | { status: "reading"; jobId: string }
  | { status: "analyzing"; jobId: string; analysis: JobAnalysis }
  | { status: "ready"; jobId: string; analysis: JobAnalysis; aiError: string | null };

export interface JobAnalyzerDeps {
  currentJobId(): string | null;
  /** Opens collapsed sections; returns how many it opened. */
  expand(): number;
  read(): JobPosting | null;
  analyze(body: JobAnalysisRequestBody): PendingRelayRequest<JobAiOutcome>;
  /** Draws (or, with null, clears) the highlights for an analysis. */
  highlight(analysis: JobAnalysis | null): void;
  wait?(ms: number): Promise<void>;
}

const SETTLE_MS = 350;
const MAX_SETTLE_ATTEMPTS = 6;
const MAX_CACHED = 40;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Findings stay for the session, so going back to a job already read costs no request.
const findingsCache = new Map<string, JobAiFindings>();

export class JobAnalyzerController {
  private state: JobAnalyzerState = { status: "idle" };
  private readonly listeners = new Set<() => void>();
  private goal: Goal | null = null;
  private jobId: string | null = null;
  // Bumped whenever the open job (or the criteria) change, so a slower earlier run can tell it is stale.
  private run = 0;
  private cancel: (() => void) | null = null;
  private posting: JobPosting | null = null;
  private stopped = false;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(private readonly deps: JobAnalyzerDeps, goal: Goal | null = null) {
    this.goal = goal;
    this.wait = deps.wait ?? sleep;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = (): JobAnalyzerState => this.state;

  private set(state: JobAnalyzerState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }

  /** The user's criteria changed: the same posting is judged again against them, once. */
  setGoal(goal: Goal | null): void {
    const before = this.criteriaKey();
    this.goal = goal;
    if (this.criteriaKey() !== before && this.posting && !this.stopped) {
      this.run += 1;
      this.cancel?.();
      void this.analyzePosting(this.posting, this.run);
    }
  }

  /** Asks again for the open job after a failed AI reading. */
  retry(): void {
    if (!this.posting || this.stopped) return;
    this.run += 1;
    this.cancel?.();
    void this.analyzePosting(this.posting, this.run);
  }

  stop(): void {
    this.stopped = true;
    this.run += 1;
    this.cancel?.();
    this.deps.highlight(null);
    this.jobId = null;
    this.posting = null;
    this.set({ status: "idle" });
  }

  private criteriaKey(): string {
    return JSON.stringify((this.goal?.criteria ?? []).map((c) => [c.id, c.label, c.importance]));
  }

  /** Called on any page change; does work only when a different job is open. Safe to call as often as needed. */
  check(): void {
    this.stopped = false;
    const id = this.deps.currentJobId();
    if (!id) {
      if (this.jobId !== null || this.state.status !== "no_job") {
        this.run += 1;
        this.cancel?.();
        this.deps.highlight(null);
        this.jobId = null;
        this.posting = null;
            this.set({ status: "no_job" });
      }
      return;
    }
    if (id === this.jobId) {
      // Same job: only repaint highlights LinkedIn's re-render wiped out.
      if (this.state.status === "ready" || this.state.status === "analyzing") this.deps.highlight(this.state.analysis);
      return;
    }
    // A different job: nothing from the last one survives.
    this.run += 1;
    this.cancel?.();
    this.cancel = null;
    this.deps.highlight(null);
    this.jobId = id;
    this.posting = null;
    this.set({ status: "reading", jobId: id });
    void this.readAndAnalyze(id, this.run);
  }

  private stale(run: number): boolean {
    return run !== this.run || this.stopped;
  }

  // Opens the collapsed parts, then reads until the text stops changing, so a half-expanded
  // description is never analyzed.
  private async readAndAnalyze(id: string, run: number): Promise<void> {
    let last = "";
    let posting: JobPosting | null = null;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt++) {
      if (this.stale(run) || this.deps.currentJobId() !== id) return;
      this.deps.expand();
      await this.wait(SETTLE_MS);
      if (this.stale(run) || this.deps.currentJobId() !== id) return;
      const read = this.deps.read();
      const text = read ? `${read.description}\n${read.companyText}` : "";
      if (read && read.jobId === id && text === last && read.description.length > 0) {
        posting = read;
        break;
      }
      last = text;
    }
    if (!posting) {
      // Never settled on a readable job: forget it so the next page change tries again.
      if (!this.stale(run)) {
        this.jobId = null;
        this.set({ status: "no_job" });
      }
      return;
    }
    this.posting = posting;
    await this.analyzePosting(posting, run);
  }

  private async analyzePosting(posting: JobPosting, run: number): Promise<void> {
    const criteria = (this.goal?.criteria ?? []).map(({ id, label, importance }) => ({ id, label, importance }));
    const key = `${posting.jobId}:${hashString(`${posting.description}\n${posting.companyText}`)}:${hashString(JSON.stringify(criteria))}`;
    const cached = findingsCache.get(key);
    const plain = buildJobAnalysis(posting, cached ?? null, this.goal);
    if (cached) {
      this.finish(posting, plain, null, run);
      return;
    }
    // What the posting plainly states shows at once, while the AI reading is still on its way.
    this.set({ status: "analyzing", jobId: posting.jobId, analysis: plain });
    this.deps.highlight(plain);
    const pending = this.deps.analyze({ job: { jobId: posting.jobId, title: posting.title, company: posting.company, headerLines: posting.headerLines, description: posting.description, companyText: posting.companyText }, criteria });
    this.cancel = pending.cancel;
    const outcome = await pending.promise;
    this.cancel = null;
    if (this.stale(run) || outcome.status === "ok" && outcome.jobId !== posting.jobId) return;
    if (outcome.status === "ok") {
      if (findingsCache.size >= MAX_CACHED) findingsCache.delete(findingsCache.keys().next().value!);
      findingsCache.set(key, outcome.findings);
      this.finish(posting, buildJobAnalysis(posting, outcome.findings, this.goal), null, run);
    } else {
      this.finish(posting, plain, outcome.reason, run);
    }
  }

  private finish(posting: JobPosting, analysis: JobAnalysis, aiError: string | null, run: number): void {
    if (this.stale(run)) return;
    this.set({ status: "ready", jobId: posting.jobId, analysis, aiError });
    this.deps.highlight(analysis);
  }
}

export function clearJobFindingsCache(): void {
  findingsCache.clear();
}
