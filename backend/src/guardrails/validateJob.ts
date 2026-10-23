// Keeps only what the posting itself supports: a finding stays only when its quote really appears in
// the posting, so nothing the model made up reaches the panel. A criterion judged from no real
// quote is "unknown", never a confident verdict.
import type { JobResponse } from "../openai/jobSchema";
import type { JobAnalysisRequest } from "../validation/jobRequestSchema";

export interface JobFinding {
  text: string;
  evidence: string;
}

export type JobMatchStatus = "strong" | "match" | "partial" | "none" | "unknown";

export interface JobCriterionMatch {
  criterionId: string;
  status: JobMatchStatus;
  reasoning: string;
  evidence: string;
}

export interface JobFindings {
  summary: string;
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
  conditions: JobFinding[];
  criteria: JobCriterionMatch[];
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();
const LIMITS = { responsibilities: 8, required: 12, preferred: 10, technicalSkills: 14, professionalSkills: 8, education: 6, experience: 6, restrictions: 10, benefits: 10, keyEvidence: 8, conditions: 10 } as const;
const MIN_QUOTE_WORDS = 2;

export function postingText(request: JobAnalysisRequest): string {
  const { job } = request;
  return [job.title, job.company, ...job.headerLines, job.description, job.companyText].join("\n");
}

function groundedQuote(quote: string, haystack: string): string {
  const needle = normalize(quote);
  return needle.split(" ").length >= MIN_QUOTE_WORDS && haystack.includes(needle) ? quote.trim().slice(0, 320) : "";
}

function findings(list: { text: string; quote: string }[], limit: number, haystack: string): JobFinding[] {
  const kept: JobFinding[] = [];
  for (const item of list) {
    const evidence = groundedQuote(item.quote, haystack);
    const text = item.text.trim().replace(/\s+/g, " ").slice(0, 160);
    if (!evidence || !text || kept.some((k) => normalize(k.text) === normalize(text))) continue;
    kept.push({ text, evidence });
    if (kept.length >= limit) break;
  }
  return kept;
}

// A company fact is kept only if the posting says it in those words.
const stated = (value: string, haystack: string) => (value.trim() && haystack.includes(normalize(value)) ? value.trim().slice(0, 120) : "");

const numbersIn = (text: string) => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));

// A summary stays only if every number in it is one the posting contains.
function groundedSummary(summary: string, posting: string): string {
  const text = summary.trim().replace(/\s+/g, " ").slice(0, 800);
  const known = new Set(numbersIn(posting));
  return text.length >= 40 && numbersIn(text).every((n) => known.has(n)) ? text : "";
}

export function validateJob(response: JobResponse, request: JobAnalysisRequest): JobFindings {
  const haystack = normalize(postingText(request));
  const focusEvidence = groundedQuote(response.company.focusQuote, haystack);
  const criteria: JobCriterionMatch[] = request.criteria.map((criterion) => {
    const result = response.criteria.find((r) => r.criterionId === criterion.id);
    const unknown: JobCriterionMatch = { criterionId: criterion.id, status: "unknown", reasoning: "The listing doesn't give enough information to judge this.", evidence: "" };
    if (!result || result.status === "unknown") return result?.reasoning.trim() ? { ...unknown, reasoning: result.reasoning.trim().slice(0, 400) } : unknown;
    const evidence = groundedQuote(result.quote, haystack);
    // Without the posting's own words, no verdict, positive or negative, can be shown to rest on anything.
    if (!evidence) return unknown;
    return { criterionId: criterion.id, status: result.status, reasoning: result.reasoning.trim().slice(0, 400), evidence };
  });
  return {
    summary: groundedSummary(response.summary, postingText(request)),
    responsibilities: findings(response.responsibilities, LIMITS.responsibilities, haystack),
    required: findings(response.required, LIMITS.required, haystack),
    preferred: findings(response.preferred, LIMITS.preferred, haystack),
    technicalSkills: findings(response.technicalSkills, LIMITS.technicalSkills, haystack),
    professionalSkills: findings(response.professionalSkills, LIMITS.professionalSkills, haystack),
    education: findings(response.education, LIMITS.education, haystack),
    experience: findings(response.experience, LIMITS.experience, haystack),
    restrictions: findings(response.restrictions, LIMITS.restrictions, haystack),
    benefits: findings(response.benefits, LIMITS.benefits, haystack),
    company: {
      industry: stated(response.company.industry, haystack),
      size: stated(response.company.size, haystack),
      headquarters: stated(response.company.headquarters, haystack),
      focus: focusEvidence ? response.company.focus.trim().slice(0, 160) : "",
      focusEvidence,
    },
    keyEvidence: findings(response.keyEvidence, LIMITS.keyEvidence, haystack),
    conditions: findings(response.conditions, LIMITS.conditions, haystack),
    criteria,
  };
}
