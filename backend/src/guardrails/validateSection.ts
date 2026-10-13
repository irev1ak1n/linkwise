import type { HeadlineOptionsResponse, SectionAnalysisResponse } from "../openai/optimizerSchema";
import type { HeadlineGenerationRequest, SectionAnalysisRequest } from "../validation/sectionRequestSchema";
import { ALWAYS_ALLOWED, isGrounded } from "./validateOptimizer";

const MAX_NOTE_LENGTH = 400;
const MAX_SUMMARY_LENGTH = 700;
const MAX_IDEAS = 3;
const MAX_HEADLINE_LENGTH = 220;
const MAX_OPTIONS = 3;

export interface ValidatedSectionAnalysis {
  state: "strong" | "improve" | "missing";
  summary: string;
  findings: SectionAnalysisResponse["findings"];
  ideas: string[];
}

// Title-case role and descriptor words a headline may use without the profile spelling them out.
const HEADLINE_WORDS = new Set([
  ...ALWAYS_ALLOWED,
  "aspiring", "student", "students", "developer", "developers", "engineer", "engineering", "software", "web", "full-stack", "full", "stack",
  "builder", "building", "builds", "creator", "focused", "enthusiast", "applications", "apps", "systems", "solutions", "technology", "tech",
  "and", "for", "of", "the", "with", "in", "at", "to", "on", "a", "an", "&", "future", "team", "teams", "graduate", "designer", "design",
]);

// Claims that need support even in lowercase.
const CLAIM_WORDS = ["certified", "certificate", "certification", "award", "winning", "winner", "champion", "founder", "intern", "expert", "licensed", "published", "patent"];

function profileSources(profile: { evidence: { text: string }[] }, ...extra: string[]): string {
  return [...profile.evidence.map((item) => item.text), ...extra].join("\n");
}

function grounded(text: string, sources: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && isGrounded(trimmed, sources);
}

export function validateSectionAnalysis(response: SectionAnalysisResponse, request: SectionAnalysisRequest): ValidatedSectionAnalysis {
  const sources = profileSources(request.profile, request.userContext);
  const findings =
    request.section === "headline"
      ? response.findings
          .filter((f, index, all) => all.findIndex((other) => other.aspect === f.aspect) === index)
          .map((f) => ({ ...f, note: f.note.trim() }))
          .filter((f) => f.note.length <= MAX_NOTE_LENGTH && grounded(f.note, sources))
      : [];
  const ideas = response.ideas.map((idea) => idea.trim()).filter((idea) => idea.length <= MAX_NOTE_LENGTH && grounded(idea, sources)).slice(0, MAX_IDEAS);
  const summary = response.summary.trim();
  // Presence is known from the page, so it decides the banner and a missing headline, not the model.
  const state = request.section === "banner" ? (request.present ? "strong" : "improve") : !request.present ? "missing" : findings.some((f) => f.verdict === "improve") ? "improve" : response.status;
  return { state, summary: summary.length <= MAX_SUMMARY_LENGTH && grounded(summary, sources) ? summary : "", findings, ideas };
}

export function isGroundedHeadline(headline: string, request: HeadlineGenerationRequest): boolean {
  const sources = profileSources(request.profile, request.currentHeadline, request.userContext, request.targetRole, request.keywords, request.additionalContext);
  const lowered = sources.toLowerCase();
  if (headline.length === 0 || headline.length > MAX_HEADLINE_LENGTH) return false;
  if (CLAIM_WORDS.some((word) => new RegExp(`\\b${word}`, "i").test(headline) && !lowered.includes(word))) return false;
  return isGrounded(headline, sources, HEADLINE_WORDS);
}

export function validateHeadlineOptions(response: HeadlineOptionsResponse, request: HeadlineGenerationRequest): { label: string; headline: string }[] {
  const seen = new Set<string>();
  return response.options
    .map((option) => ({ label: option.label.trim().slice(0, 40), headline: option.headline.trim().replace(/\s+/g, " ") }))
    .filter((option) => {
      const key = option.headline.toLowerCase();
      if (seen.has(key) || key === request.currentHeadline.trim().toLowerCase() || !isGroundedHeadline(option.headline, request)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_OPTIONS);
}
