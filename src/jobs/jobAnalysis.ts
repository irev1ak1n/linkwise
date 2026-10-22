// Builds the Job Analyzer's result from what the posting plainly states and what the AI reading
// found in it. The overall match is not the model's number: each criterion's verdict goes through
// the same weighting the Profile Analyzer uses (computeMatchResult), so the score always comes from
// criteria and their evidence, and the two analyzers can never disagree about how a Must-Have counts.
import type { Criterion, Goal } from "../models/goal";
import type { EvidenceStrength } from "../models/evidence";
import { computeMatchResult, type CriterionAssessment } from "../matching/scoreProfile";
import { readPostingFacts } from "./jobFacts";
import type { JobAiFindings, JobAnalysis, JobCompensation, JobCriterionMatch, JobFinding, JobMatchStatus, JobPosting } from "./jobTypes";

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, " ").trim();

function union(first: JobFinding[], second: JobFinding[], limit: number, by: (f: JobFinding) => string = (f) => key(f.text)): JobFinding[] {
  const kept: JobFinding[] = [];
  for (const item of [...first, ...second]) {
    if (!kept.some((k) => by(k) === by(item))) kept.push(item);
    if (kept.length >= limit) break;
  }
  return kept;
}

const DEGREE = /\b(degree|bachelor|master|phd|doctorate|enrolled|pursuing|graduat\w+|gpa|major|diploma)\b/i;
const YEARS = /\b\d+\+?\s*(?:-\s*\d+\s*)?years?\b|\bexperience (in|with)\b/i;

export const STATUS_LABEL: Record<JobMatchStatus, string> = { strong: "Strong match", match: "Match", partial: "Partial match", none: "No match", unknown: "Unknown" };

const STRENGTH: Record<JobMatchStatus, EvidenceStrength> = { strong: "strong", match: "moderate", partial: "weak", none: "missing", unknown: "unknown" };

export function formatCompensation(pay: JobCompensation | null): string {
  if (!pay || pay.min === null) return "Not specified";
  const symbol = pay.currency === "EUR" ? "€" : pay.currency === "GBP" ? "£" : "$";
  const n = (v: number) => `${symbol}${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const range = pay.max !== null && pay.max !== pay.min ? `${n(pay.min)}–${n(pay.max)}` : n(pay.min);
  return pay.period ? `${range}/${pay.period === "year" ? "year" : pay.period}` : range;
}

function keyEvidence(analysis: Pick<JobAnalysis, "job" | "compensation" | "restrictions" | "responsibilities">, ai: JobFinding[]): JobFinding[] {
  const { job, compensation, restrictions } = analysis;
  const lead: JobFinding[] = [];
  if (compensation && compensation.min !== null) lead.push({ text: formatCompensation(compensation), evidence: compensation.rawText });
  const where = [job.location, job.workplaceType].filter(Boolean).join(" · ");
  if (where) lead.push({ text: where.replace(/^(.*) · (remote|hybrid|on-site)$/, (_, place, kind) => `${kind[0].toUpperCase()}${kind.slice(1)} · ${place}`), evidence: where });
  const kind = [job.employmentType, job.experienceLevel].filter(Boolean).join(" · ");
  if (kind) lead.push({ text: kind, evidence: kind });
  return union([...lead, ...ai, ...restrictions.slice(0, 2)], [], 8);
}

function assessments(goal: Goal, matches: JobCriterionMatch[]): Map<string, CriterionAssessment> {
  const map = new Map<string, CriterionAssessment>();
  for (const match of matches) {
    const strength = STRENGTH[match.status];
    map.set(match.criterionId, {
      strength,
      explanation: match.reasoning,
      note: match.reasoning,
      // The evidence is the posting's own words; the profile-shaped field is only a container for it.
      evidence: match.evidence ? { fieldLabel: "Job posting", snippet: match.evidence, sourceSection: "about" } : undefined,
    });
  }
  // A strong or moderate verdict always has evidence (the backend guarantees it); keep that invariant here too.
  for (const [id, a] of map) if ((a.strength === "strong" || a.strength === "moderate") && !a.evidence) map.set(id, { ...a, strength: "unknown" });
  void goal;
  return map;
}

function summaryOf(goal: Goal | null, matches: JobCriterionMatch[], score: number | null, disqualified: boolean): string {
  if (!goal || goal.criteria.length === 0) return "Add what you're looking for to see how well this job fits.";
  if (disqualified) {
    const hit = matches.find((m) => goal.criteria.find((c) => c.id === m.criterionId)?.importance === "EXCLUDED" && m.status === "strong");
    return `The listing includes something you want to avoid: ${hit?.reasoning ?? "an excluded criterion"}`;
  }
  const label = (m: JobCriterionMatch) => goal.criteria.find((c) => c.id === m.criterionId)?.label ?? m.criterion;
  const good = matches.filter((m) => m.status === "strong" || m.status === "match");
  const unmet = matches.filter((m) => m.status === "none" && goal.criteria.find((c) => c.id === m.criterionId)?.importance === "MUST_HAVE");
  const unknown = matches.filter((m) => m.status === "unknown").length;
  const parts = [`${good.length} of ${matches.length} criteria met`];
  if (unmet.length) parts.push(`not met: ${unmet.map(label).join(", ")}`);
  if (unknown) parts.push(`${unknown} not stated in the listing`);
  const judged = matches.filter((m) => m.status !== "unknown").length;
  return `${score === null ? "No score yet" : `Based on the ${judged} of ${matches.length} criteria the listing speaks to`}. ${parts.join("; ")}.`;
}

export function buildJobAnalysis(posting: JobPosting, ai: JobAiFindings | null, goal: Goal | null): JobAnalysis {
  const facts = readPostingFacts(posting);
  const header = facts.header;
  const lists = facts.lists;
  const requiredFallback = lists.required;
  const education = ai?.education.length ? ai.education : requiredFallback.filter((f) => DEGREE.test(f.evidence)).slice(0, 4);
  const experience = ai?.experience.length ? ai.experience : requiredFallback.filter((f) => YEARS.test(f.evidence) && !DEGREE.test(f.evidence)).slice(0, 4);
  const restrictions = union(ai?.restrictions ?? [], facts.restrictions, 12, (f) => key(f.evidence));
  const base = {
    job: { title: posting.title, company: posting.company, location: header.location, workplaceType: header.workplaceType, employmentType: header.employmentType, experienceLevel: header.experienceLevel, postedDate: header.postedDate, applicants: header.applicants },
    compensation: facts.compensation,
    restrictions,
    responsibilities: ai?.responsibilities.length ? ai.responsibilities : lists.responsibilities.slice(0, 8),
  };

  const matches: JobCriterionMatch[] = (goal?.criteria ?? []).map((criterion: Criterion) => {
    const found = ai?.criteria.find((c) => c.criterionId === criterion.id);
    return found
      ? { ...found, criterion: criterion.label }
      : { criterionId: criterion.id, criterion: criterion.label, status: "unknown", reasoning: ai ? "The listing doesn't give enough information to judge this." : "The AI reading isn't available right now.", evidence: "" };
  });
  const result = goal && goal.criteria.length > 0 ? computeMatchResult(goal, assessments(goal, matches), true) : null;
  const score = result?.scorePercent ?? null;

  return {
    jobId: posting.jobId,
    job: base.job,
    compensation: base.compensation,
    responsibilities: base.responsibilities,
    requirements: { required: ai?.required.length ? ai.required : lists.required.slice(0, 12), preferred: ai?.preferred.length ? ai.preferred : lists.preferred.slice(0, 10) },
    skills: {
      technical: union(ai?.technicalSkills ?? [], facts.technical, 14),
      professional: union(ai?.professionalSkills ?? [], facts.professional, 8),
    },
    education,
    experience,
    benefits: union(ai?.benefits ?? [], union(facts.benefits, lists.benefits.slice(0, 0), 10), 12, (f) => key(f.evidence)),
    restrictions,
    company: {
      name: posting.company,
      industry: ai?.company.industry || facts.company.industry,
      size: ai?.company.size || facts.company.size,
      headquarters: ai?.company.headquarters || facts.company.headquarters,
      focus: ai?.company.focus || null,
      focusEvidence: ai?.company.focusEvidence ?? "",
      followers: facts.company.followers,
    },
    keyEvidence: keyEvidence(base, ai?.keyEvidence ?? []),
    criteriaMatches: matches,
    overallMatch: { score, confidence: result?.confidence ?? 0, disqualified: result?.disqualified ?? false, summary: summaryOf(goal, matches, score, result?.disqualified ?? false) },
    aiAvailable: ai !== null,
  };
}
