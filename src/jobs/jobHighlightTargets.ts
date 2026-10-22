// Which words of the posting to mark for an analysis: the phrases its findings rest on, each in the
// category it belongs to. Whole paragraphs are never marked; a finding without a short quote is skipped.
import type { JobHighlightTarget } from "../linkedin/jobs/jobHighlighter";
import type { JobAnalysis, JobFinding } from "./jobTypes";

const MAX_QUOTE_LENGTH = 220;
const AUTHORIZATION = new Set(["Work authorization", "Citizenship", "Sponsorship"]);

const quotes = (list: JobFinding[], category: JobHighlightTarget["category"]): JobHighlightTarget[] =>
  list.filter((f) => f.evidence.length > 0 && f.evidence.length <= MAX_QUOTE_LENGTH).map((f) => ({ category, quote: f.evidence }));

export function highlightTargets(analysis: JobAnalysis): JobHighlightTarget[] {
  const targets: JobHighlightTarget[] = [];
  const pay = analysis.compensation;
  if (pay?.rawText && pay.rawText.length <= MAX_QUOTE_LENGTH) targets.push({ category: "salary", quote: pay.rawText });
  for (const other of pay?.other ?? []) targets.push(...quotes([other], "salary"));
  // Restrictions go first: a deal breaker is marked as one even when it is also listed as a requirement.
  for (const restriction of analysis.restrictions) targets.push(...quotes([restriction], AUTHORIZATION.has(restriction.text) ? "authorization" : "restriction"));
  targets.push(...quotes(analysis.responsibilities, "responsibility"));
  targets.push(...quotes(analysis.requirements.required, "required"));
  targets.push(...quotes(analysis.requirements.preferred, "preferred"));
  // A skill marks the word itself, found inside the sentence it came from.
  for (const skill of [...analysis.skills.technical, ...analysis.skills.professional]) {
    const at = skill.evidence.toLowerCase().indexOf(skill.text.toLowerCase());
    if (at !== -1) targets.push({ category: "skill", quote: skill.evidence.slice(at, at + skill.text.length) });
  }
  targets.push(...quotes(analysis.education, "education"));
  targets.push(...quotes(analysis.experience, "experience"));
  targets.push(...quotes(analysis.benefits, "benefit"));
  const seen = new Set<string>();
  // The first category to claim a phrase keeps it, so a sentence is never drawn twice.
  return targets.filter((t) => (seen.has(t.quote) ? false : (seen.add(t.quote), true)));
}
