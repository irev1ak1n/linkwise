import type { HeadlineGenerationRequest, SectionAnalysisRequest } from "../validation/sectionRequestSchema";

const evidenceJson = (request: { profile: { evidence: { id: string; section: string; text: string }[] } }) =>
  JSON.stringify(request.profile.evidence.map((item) => ({ id: item.id, section: item.section, text: item.text })), null, 2);

export const HEADLINE_ANALYSIS_PROMPT = `You review the headline on a person's OWN LinkedIn profile for LinkWise. Judge the actual current headline against the rest of the profile evidence.

Return:
- status: "strong" if the headline already works well and changes would be minor, otherwise "improve". Do not invent problems to have something to say.
- summary: two or three sentences of specific, honest feedback in second person ("Your headline..."). Say what works and the most valuable change.
- findings: one entry per aspect you can judge, each with verdict "good" or "improve" and a short note specific to this headline:
  role (communicates a role or direction), skills (useful expertise), keywords (terms people would search for, given the evidence), specificity (specific rather than filler), focus (not overloaded with unrelated terms), differentiation (something that sets the person apart), readability (easy to read), accuracy (matches the evidence).
- ideas: leave empty.

Rules:
- Quote or name only words, skills, schools, employers, numbers, and achievements that appear in the headline, the evidence, or the user's own context.
- When suggesting what to add, point to things the evidence actually shows (for example a skill listed in Education or a result in Experience).
- No generic advice, no buzzwords, no recruiter cliches.`;

export const BANNER_ANALYSIS_PROMPT = `You suggest banner ideas for a person's OWN LinkedIn profile for LinkWise. You cannot see the banner image itself: you only know whether a custom banner exists.

Return:
- status: "strong".
- summary: one or two sentences in second person tying a banner direction to what the profile is about, grounded in the evidence (for example "Your profile focuses on web development, so..."). Never describe or judge the current image.
- findings: empty.
- ideas: up to three short, concrete banner ideas grounded in the evidence, phrased as options.

Rules: mention only fields, projects, schools, organizations, and achievements that appear in the evidence or the user's own context. No numbers that are not in the evidence.`;

export function buildSectionUserPrompt(request: SectionAnalysisRequest): string {
  const headline = request.profile.evidence.find((item) => item.section === "headline")?.text ?? "";
  const subject = request.section === "headline" ? `current headline:\n${JSON.stringify(headline)}` : `custom banner present: ${request.present}`;
  return `${subject}\n\nevidence:\n${evidenceJson(request)}\n\nuser's own context (NOT on LinkedIn):\n${JSON.stringify(request.userContext)}`;
}

export const HEADLINE_GENERATION_PROMPT = `You write LinkedIn headline options for a person's OWN profile, for them to review and copy. You never post anything.

Write exactly three options, each with a short label describing its angle (for example Balanced, Technical, Achievement-focused; use better labels if they fit).

Every headline must:
- be grounded only in the profile evidence and what the user explicitly wrote (target role, keywords, additional context, own context);
- never invent skills, employers, job titles held, awards, credentials, numbers, or experience;
- present the target role as a direction (for example "Aspiring", "student", "focused on") unless the evidence shows the person already holds that role;
- use the requested keywords only where they fit; never cram every keyword into one line;
- be concise and human-readable, at most 220 characters, most important words first;
- be written in the requested language;
- avoid filler like "passionate", "innovative", "results-driven", "hardworking", and avoid emoji.

Return the three options; do not repeat the current headline.`;

export function buildHeadlineUserPrompt(request: HeadlineGenerationRequest): string {
  return [
    `current headline: ${JSON.stringify(request.currentHeadline)}`,
    `target role: ${JSON.stringify(request.targetRole)}`,
    `keywords to include where relevant: ${JSON.stringify(request.keywords)}`,
    `additional context from the user: ${JSON.stringify(request.additionalContext)}`,
    `language: ${request.language}`,
    `evidence:\n${evidenceJson(request)}`,
    `user's own context (NOT on LinkedIn):\n${JSON.stringify(request.userContext)}`,
  ].join("\n\n");
}
