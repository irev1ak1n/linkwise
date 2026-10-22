import { z } from "zod";
import type { JobAnalysisRequest } from "../validation/jobRequestSchema";

// Every finding carries the exact words of the posting it rests on, so it can be traced and checked.
const finding = z.object({ text: z.string(), quote: z.string() });

export const jobResponseSchema = z.object({
  responsibilities: z.array(finding),
  required: z.array(finding),
  preferred: z.array(finding),
  technicalSkills: z.array(finding),
  professionalSkills: z.array(finding),
  education: z.array(finding),
  experience: z.array(finding),
  restrictions: z.array(finding),
  benefits: z.array(finding),
  company: z.object({ industry: z.string(), size: z.string(), headquarters: z.string(), focus: z.string(), focusQuote: z.string() }),
  keyEvidence: z.array(finding),
  criteria: z.array(
    z.object({
      criterionId: z.string(),
      status: z.enum(["strong", "match", "partial", "none", "unknown"]),
      reasoning: z.string(),
      quote: z.string(),
    }),
  ),
});

export type JobResponse = z.infer<typeof jobResponseSchema>;

export const JOB_SYSTEM_PROMPT = `You read one LinkedIn job posting for LinkWise's Job Analyzer and pull out what matters, so the person does not have to read it all.

You receive the posting's top-card lines, the full description, the company section, and the criteria the person is looking for (possibly none).

Every finding has "text" (short, in your own concise words) and "quote" (words copied EXACTLY from the posting that support it, 4 to 25 words, no ellipsis). A finding whose quote is not in the posting is discarded, so never paraphrase a quote and never invent one.

Extract only what the posting says; never guess:
- responsibilities: what the person would actually do, at most 8, concise ("Build and maintain internal APIs"), not copied paragraphs.
- required: qualifications the posting presents as required or minimum. preferred: ones it presents as preferred, a plus, nice to have, or bonus. Never put a preferred item under required.
- technicalSkills: named languages, frameworks, tools, platforms, methods (text is the skill name). professionalSkills: real professional skills the posting asks for (communication, leadership). Skip generic filler.
- education: degree, field, enrollment, graduation date, GPA. experience: years or kind of experience asked for.
- restrictions: things that could rule someone in or out: work authorization or citizenship, sponsorship, age limits, clearance, relocation, travel, driver's license, schedule (nights, weekends), enrollment or graduation timing, minimum GPA, unpaid or stipend-only, physical requirements, background checks, in-office requirements.
- benefits: only benefits the posting actually states.
- company: industry, size, headquarters taken from the company section; "focus" is what the company does, in one short phrase, with its quote. Leave a field "" when the posting does not state it.
- keyEvidence: the 4 to 8 facts someone most needs to know in a few seconds (pay, workplace, program length or start date, level, a standout requirement, the core work), each with its quote.
- Compensation is parsed separately; do not return it unless it is a restriction like "unpaid".

Criteria: for EACH criterion given, return one result with its criterionId.
- status: "strong" when the posting clearly and directly satisfies it; "match" when it clearly does but less directly; "partial" when it satisfies part of it or only by inference; "none" when the posting clearly contradicts it (for example the criterion says remote and the posting says on-site); "unknown" when the posting does not give enough information. Silence is "unknown", not "none".
- reasoning: one short sentence about what the posting says, in plain words.
- quote: the exact posting words that decide it (required for strong, match, partial, and none; "" for unknown).
- A criterion about the person (their membership, languages spoken, skills they have) is judged by what the job asks for or offers that relates to it. Do not infer matches from nothing.
- Do not simply keyword-match: understand what the criterion means.`;

export function buildJobUserPrompt(request: JobAnalysisRequest): string {
  const { job } = request;
  const criteria = request.criteria.map((c) => ({ id: c.id, criterion: c.label, importance: c.importance }));
  return [
    `title: ${JSON.stringify(job.title)}`,
    `company: ${JSON.stringify(job.company)}`,
    `top card:\n${job.headerLines.join("\n")}`,
    `description:\n${job.description}`,
    job.companyText ? `company section:\n${job.companyText}` : "company section: (none)",
    `criteria:\n${JSON.stringify(criteria, null, 2)}`,
  ].join("\n\n");
}
