// Keeps Profile Optimizer advice grounded: every recommendation must match where it claims to come
// from, and nothing may name a project, credential, organization, or number that neither the
// profile nor the user's own context mentions.
import type { OptimizerResponse, SectionAssessment } from "../openai/optimizerSchema";
import type { OptimizeProfileRequest, OptimizerDraftRequest, OptimizerSection } from "../validation/optimizerRequestSchema";
import { findGroundedText } from "./validateSignals";

const MAX_REASON_LENGTH = 700;
const MAX_SUGGESTION_LENGTH = 300;
const MAX_SUGGESTIONS = 4;
const MAX_SUMMARY_LENGTH = 600;
const DRAFT_LIMITS: Record<OptimizerDraftRequest["section"], number> = { headline: 220, about: 2600, experience: 2000 };

export interface ValidatedAssessment {
  section: OptimizerSection;
  state: SectionAssessment["state"];
  impact: SectionAssessment["impact"];
  reason: string;
  sourceType: SectionAssessment["sourceType"];
  evidenceIds: string[];
  suggestions: string[];
}

export interface ValidatedOptimizerResult {
  summary: string;
  sections: ValidatedAssessment[];
}

// Conditional advice for a missing section that claims nothing about the person.
const GENERIC_ADD: Record<OptimizerSection, string> = {
  photo: "There is no profile photo. If you add a clear, recent photo, your profile is easier to recognize and trust.",
  banner: "There is no banner image. If you have an image that reflects your field or work, a banner can make the top of your profile more distinctive.",
  headline: "There is no headline. A short, specific headline helps readers understand who you are at a glance.",
  about: "There is no About section. If you add a few sentences about your focus and strongest experience, readers get context before the details.",
  featured: "Featured is missing. If you have projects, articles, websites, demos, or other work samples, this section could make them more visible.",
  experience: "There is no Experience section. If you have jobs, internships, volunteer roles, or other positions, listing them gives readers the core of your background.",
  education: "There is no Education section. If you have relevant schooling or programs, adding them gives readers useful context.",
  projects: "Projects is missing. If you have personal, school, competition, open-source, or technical projects, adding them could make your work easier to evaluate.",
  skills: "Skills is missing. If you have skills you use in your work, listing them helps readers and search find you.",
  certifications: "Licenses & Certifications is missing. If you have relevant certifications or licenses, adding them could strengthen your credibility.",
  volunteering: "Volunteer Experience is missing. If you have volunteered, adding it could give readers more context about you.",
  honors: "Honors & Awards is missing. If you have received awards, scholarships, or competition results, adding them could highlight your achievements.",
  organizations: "Organizations is missing. If you belong to clubs, associations, or teams, adding them could show where you are involved.",
  languages: "Languages is missing. If you speak more than one language, listing them could be useful to readers.",
  location: "There is no location. If you add your city or region, readers know where you are based.",
};

// Words advice may always use: section names, LinkedIn's own terms, and common file and link words.
const ALWAYS_ALLOWED = new Set(
  [
    "linkedin", "profile", "photo", "banner", "headline", "about", "featured", "experience", "education", "projects", "project",
    "skills", "skill", "licenses", "license", "certifications", "certification", "volunteer", "volunteering", "honors", "awards",
    "award", "organizations", "languages", "location", "top", "open", "url", "urls", "pdf", "cv", "i", "if", "you", "your",
  ],
);

function sentenceStart(text: string, index: number): boolean {
  const before = text.slice(0, index).replace(/["'“‘(\[]+$/, "");
  return before.trim() === "" || /[.!?:;•\-–—]\s*$/.test(before);
}

function mentions(sources: string, token: string): boolean {
  const escaped = token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\d])${escaped}($|[^\\p{L}\\d])`, "u").test(sources);
}

// Every number, acronym, and mid-sentence capitalized name in text must appear in the sources.
export function isGrounded(text: string, sources: string): boolean {
  const lowered = sources.toLowerCase();
  for (const number of text.match(/\d+(?:[.,]\d+)*/g) ?? []) {
    if (!lowered.includes(number)) return false;
  }
  for (const match of text.matchAll(/[\p{L}][\p{L}\d&+#'-]*/gu)) {
    const token = match[0].replace(/['-]+$/, "");
    if (ALWAYS_ALLOWED.has(token.toLowerCase())) continue;
    const acronym = token.length >= 2 && token === token.toUpperCase() && /\p{Lu}/u.test(token);
    const name = /^\p{Lu}/u.test(token) && !sentenceStart(text, match.index ?? 0);
    if ((acronym || name) && !mentions(lowered, token.replace(/'s$/i, ""))) return false;
  }
  return true;
}

function isConditional(text: string): boolean {
  return /\bif you\b/i.test(text);
}

function genericAdd(assessment: SectionAssessment): ValidatedAssessment {
  return { section: assessment.section, state: "add", impact: assessment.impact, reason: GENERIC_ADD[assessment.section], sourceType: "general_best_practice", evidenceIds: [], suggestions: [] };
}

export function validateOptimizerResponse(response: OptimizerResponse, request: OptimizeProfileRequest): ValidatedOptimizerResult {
  const evidence = new Map(request.profile.evidence.map((item) => [item.id, item]));
  const presence = new Map(request.sections.map((p) => [p.section, p]));
  const context = request.userContext.trim();
  const profileText = request.profile.evidence.map((item) => item.text).join("\n");
  const sourcesFor: Record<SectionAssessment["sourceType"], string> = {
    linkedin_profile: profileText,
    user_context: `${profileText}\n${context}`,
    general_best_practice: "",
  };

  const sections: ValidatedAssessment[] = [];
  for (const raw of response.assessments) {
    const known = presence.get(raw.section);
    if (!known || sections.some((s) => s.section === raw.section)) continue;
    if (known.present ? raw.state === "add" : raw.state !== "add") continue;

    let evidenceIds = [...new Set(raw.evidenceIds.filter((id) => evidence.has(id)))];
    let sourceType = raw.sourceType;
    if (sourceType === "linkedin_profile" && evidenceIds.length === 0) evidenceIds = known.evidenceIds.filter((id) => evidence.has(id));
    const presenceOnly = known.present && (raw.section === "photo" || raw.section === "banner");
    const sourceOk =
      sourceType === "general_best_practice" ||
      (sourceType === "linkedin_profile" && (evidenceIds.length > 0 || presenceOnly)) ||
      (sourceType === "user_context" && context.length > 0 && !!raw.contextQuote && findGroundedText(context, raw.contextQuote) !== null);
    if (sourceType === "general_best_practice") evidenceIds = [];

    const reason = raw.reason.trim();
    const reasonOk = sourceOk && reason.length > 0 && reason.length <= MAX_REASON_LENGTH && isGrounded(reason, sourcesFor[sourceType]);
    const conditionalOk = !(raw.state === "add" && sourceType === "general_best_practice") || isConditional(reason);
    if (!reasonOk || !conditionalOk) {
      if (raw.state === "add") sections.push(genericAdd(raw));
      continue;
    }
    const suggestions =
      raw.state === "strong"
        ? []
        : raw.suggestions
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && s.length <= MAX_SUGGESTION_LENGTH && isGrounded(s, sourcesFor[sourceType]))
            .slice(0, MAX_SUGGESTIONS);
    sections.push({ section: raw.section, state: raw.state, impact: raw.state === "strong" ? "low" : raw.impact, reason, sourceType, evidenceIds, suggestions });
  }

  const summary = response.summary.trim();
  const summaryOk = summary.length <= MAX_SUMMARY_LENGTH && isGrounded(summary, sourcesFor.user_context);
  return { summary: summaryOk ? summary : "", sections };
}

// A draft may reorder and tighten, but every number and name in it must already be known.
export function validateDraft(draft: string, request: OptimizerDraftRequest): string | null {
  const text = draft.trim();
  if (text.length === 0 || text.length > DRAFT_LIMITS[request.section]) return null;
  const sources = `${request.profile.evidence.map((item) => item.text).join("\n")}\n${request.userContext}`;
  return isGrounded(text, sources) ? text : null;
}
