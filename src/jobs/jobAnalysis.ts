// Builds the Job Analyzer's result from what the posting plainly states and what the AI reading
// found in it. The overall match is not the model's number: each criterion's verdict goes through
// the same weighting the Profile Analyzer uses (computeMatchResult), so the score always comes from
// criteria and their evidence, and the two analyzers can never disagree about how a Must-Have counts.
import type { Criterion, Goal } from "../models/goal";
import type { EvidenceStrength } from "../models/evidence";
import { computeMatchResult, type CriterionAssessment } from "../matching/scoreProfile";
import { readPostingFacts } from "./jobFacts";
import { dedupeAcross } from "./dedupeFacts";
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

const WORKPLACE_PHRASE = { remote: "Remote", hybrid: "Hybrid", "on-site": "On-site" } as const;

// The plain facts as sentences a reader can use as they are.
function factSentences(analysis: Pick<JobAnalysis, "job" | "compensation">): JobFinding[] {
  const { job, compensation } = analysis;
  const lead: JobFinding[] = [];
  if (compensation && compensation.min !== null) lead.push({ text: `Pays ${formatCompensation(compensation)}.`, evidence: compensation.rawText });
  const workplace = job.workplaceType ? WORKPLACE_PHRASE[job.workplaceType] : null;
  if (workplace || job.location) {
    const text = workplace && job.location ? `${workplace} in ${job.location}.` : workplace ? `${workplace} position.` : `Located in ${job.location}.`;
    lead.push({ text, evidence: [job.location, job.workplaceType].filter(Boolean).join(" · ") });
  }
  const kind = [job.employmentType, job.experienceLevel].filter(Boolean).join(", ");
  if (kind) lead.push({ text: `${kind} role.`, evidence: kind });
  return lead;
}

const asSentence = (f: JobFinding): JobFinding => ({ ...f, text: /[.!?]$/.test(f.text) ? f.text : `${f.text}.` });

// Requirements & conditions: pay, place, schedule, qualifications, restrictions, general benefits. The AI's lines
// come first; plain facts only fill in what they did not say. Every fact is kept once, here or in Key evidence.
function conditionsAndEvidence(
  analysis: Pick<JobAnalysis, "job" | "compensation" | "restrictions" | "responsibilities" | "education" | "experience" | "benefits" | "skills">,
  ai: JobAiFindings | null,
): { conditions: JobFinding[]; keyEvidence: JobFinding[] } {
  const plainConditions = [
    ...factSentences(analysis),
    ...analysis.education.map((f) => ({ text: f.evidence, evidence: f.evidence })),
    ...analysis.experience.map((f) => ({ text: f.evidence, evidence: f.evidence })),
    ...analysis.restrictions.map((f) => ({ text: f.evidence, evidence: f.evidence })),
    ...analysis.benefits.map((f) => ({ text: f.evidence, evidence: f.evidence })),
  ].map(asSentence);
  const skillLine = analysis.skills.technical.length > 0 ? [{ text: `The work uses ${analysis.skills.technical.slice(0, 5).map((s) => s.text).join(", ")}.`, evidence: analysis.skills.technical[0]!.evidence }] : [];
  const plainEvidence = [...analysis.responsibilities.map((f) => ({ text: f.evidence, evidence: f.evidence })).map(asSentence), ...skillLine];
  const [conditions, keyEvidence] = dedupeAcross(
    [[...(ai?.conditions ?? []).map(asSentence), ...plainConditions], [...(ai?.keyEvidence ?? []).map(asSentence), ...(ai?.keyEvidence.length ? [] : plainEvidence)]],
    [10, 8],
  );
  return { conditions: conditions!, keyEvidence: keyEvidence! };
}

// What the posting plainly says, as a short paragraph, for when no AI summary is available.
export function plainSummary(analysis: Pick<JobAnalysis, "job" | "compensation" | "responsibilities" | "restrictions">): string {
  const { job } = analysis;
  const where = [job.workplaceType ? WORKPLACE_PHRASE[job.workplaceType].toLowerCase() : null, job.location ? `in ${job.location}` : null].filter(Boolean).join(" ");
  const parts = [`${job.title || "This job"}${job.company ? ` at ${job.company}` : ""}${where ? `, ${where}` : ""}${job.employmentType ? `, ${job.employmentType.toLowerCase()}` : ""}.`];
  if (analysis.compensation && analysis.compensation.min !== null) parts.push(`It pays ${formatCompensation(analysis.compensation)}.`);
  if (analysis.responsibilities.length > 0) parts.push(`The work includes ${analysis.responsibilities.slice(0, 2).map((r) => r.text.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())).join(" and ")}.`);
  if (analysis.restrictions.length > 0) parts.push(`Worth checking: ${analysis.restrictions.slice(0, 3).map((r) => r.text.toLowerCase()).join(", ")}.`);
  return parts.join(" ");
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

  const benefits = union(ai?.benefits ?? [], union(facts.benefits, lists.benefits.slice(0, 0), 10), 12, (f) => key(f.evidence));
  const skills = { technical: union(ai?.technicalSkills ?? [], facts.technical, 14), professional: union(ai?.professionalSkills ?? [], facts.professional, 8) };
  const split = conditionsAndEvidence({ job: base.job, compensation: base.compensation, restrictions, responsibilities: base.responsibilities, education, experience, benefits, skills }, ai);
  return {
    jobId: posting.jobId,
    summary: ai?.summary || plainSummary({ job: base.job, compensation: base.compensation, responsibilities: base.responsibilities, restrictions }),
    job: base.job,
    compensation: base.compensation,
    responsibilities: base.responsibilities,
    requirements: { required: ai?.required.length ? ai.required : lists.required.slice(0, 12), preferred: ai?.preferred.length ? ai.preferred : lists.preferred.slice(0, 10) },
    skills,
    education,
    experience,
    benefits,
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
    ...split,
    criteriaMatches: matches,
    overallMatch: { score, confidence: result?.confidence ?? 0, disqualified: result?.disqualified ?? false, summary: summaryOf(goal, matches, score, result?.disqualified ?? false) },
    aiAvailable: ai !== null,
  };
}
