// The Job Analyzer's data: what is read off a LinkedIn posting, and what is found in it. Every
// finding keeps the posting's own words ("evidence") so it can be traced, and later highlighted.

/** A posting as read from the page, with its collapsed sections already expanded. */
export interface JobPosting {
  jobId: string;
  url: string;
  title: string;
  company: string;
  /** The top card's lines: location, posted date, workplace and employment chips. */
  headerLines: string[];
  description: string;
  companyText: string;
}

export interface JobFinding {
  text: string;
  /** Words copied from the posting that support the finding. */
  evidence: string;
}

export type WorkplaceType = "remote" | "hybrid" | "on-site";
export type JobMatchStatus = "strong" | "match" | "partial" | "none" | "unknown";

export interface JobCompensation {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: "hour" | "year" | "month" | "week" | "day" | null;
  rawText: string;
  /** Bonuses, commission, stipends, and other pay named elsewhere in the posting. */
  other: JobFinding[];
}

export interface JobCriterionMatch {
  criterionId: string;
  criterion: string;
  status: JobMatchStatus;
  reasoning: string;
  evidence: string;
}

/** What the backend's AI reading returns, already checked against the posting. */
export interface JobAiFindings {
  responsibilities: JobFinding[];
  required: JobFinding[];
  preferred: JobFinding[];
  technicalSkills: JobFinding[];
  professionalSkills: JobFinding[];
  education: JobFinding[];
  experience: JobFinding[];
  restrictions: JobFinding[];
  benefits: JobFinding[];
  company: { industry: string; size: string; headquarters: string; focus: string; focusEvidence: string };
  keyEvidence: JobFinding[];
  criteria: { criterionId: string; status: JobMatchStatus; reasoning: string; evidence: string }[];
}

export interface JobAnalysis {
  jobId: string;
  job: {
    title: string;
    company: string;
    location: string | null;
    workplaceType: WorkplaceType | null;
    employmentType: string | null;
    experienceLevel: string | null;
    postedDate: string | null;
    applicants: string | null;
  };
  /** null when the posting states no pay: "Not specified", not "no pay". */
  compensation: JobCompensation | null;
  responsibilities: JobFinding[];
  requirements: { required: JobFinding[]; preferred: JobFinding[] };
  skills: { technical: JobFinding[]; professional: JobFinding[] };
  education: JobFinding[];
  experience: JobFinding[];
  benefits: JobFinding[];
  /** Details that can decide whether someone wants or qualifies for the job. */
  restrictions: JobFinding[];
  company: { name: string; industry: string | null; size: string | null; headquarters: string | null; focus: string | null; focusEvidence: string; followers: string | null };
  keyEvidence: JobFinding[];
  criteriaMatches: JobCriterionMatch[];
  overallMatch: { score: number | null; confidence: number; disqualified: boolean; summary: string };
  /** Whether the AI reading ran; without it, only what is stated plainly in the posting is shown. */
  aiAvailable: boolean;
}
