import type { AboutOptionsResponse, HeadlineOptionsResponse, SectionAnalysisResponse } from "../openai/optimizerSchema";
import type { AboutGenerationRequest, HeadlineGenerationRequest, SectionAnalysisRequest } from "../validation/sectionRequestSchema";
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
  const ideas = response.ideas.map((idea) => idea.trim()).filter((idea) => idea.length <= MAX_NOTE_LENGTH && grounded(idea, sources)).slice(0, MAX_IDEAS);
  const summary = response.summary.trim();
  // Presence is known from the page, so it decides the banner's state, not the model.
  return { state: request.present ? "strong" : "improve", summary: summary.length <= MAX_SUMMARY_LENGTH && grounded(summary, sources) ? summary : "", findings: [], ideas };
}

export function isGroundedHeadline(headline: string, request: HeadlineGenerationRequest): boolean {
  const sources = profileSources(request.profile, request.currentHeadline, request.userContext, request.include, request.format, request.targetRole, request.keywords, request.additionalContext);
  const lowered = sources.toLowerCase();
  if (headline.length === 0 || headline.length > MAX_HEADLINE_LENGTH) return false;
  if (CLAIM_WORDS.some((word) => new RegExp(`\\b${word}`, "i").test(headline) && !lowered.includes(word))) return false;
  return isGrounded(headline, sources, HEADLINE_WORDS);
}

const wordSet = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\d+#.]{3,}/gu) ?? []);

// How alike two texts are, by shared words: 1 is the same words, 0 shares none.
export function similarity(a: string, b: string): number {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (left.size + right.size - shared);
}

// A run of five or more tools or keywords in one part of a headline reads as a keyword list.
const MAX_LIST_ITEMS = 4;
// Headlines share a lead ("Aspiring Software Engineer | ..."), so they get more room than About texts.
const MAX_HEADLINE_SIMILARITY = 0.7;
const MAX_SIMILARITY = 0.6;

export function isKeywordList(headline: string): boolean {
  return headline.split(/\s*[|\u2022\u00b7]\s*/).some((part) => part.split(/\s*(?:,|&|\+|\/|\band\b)\s*/i).filter((item) => item.trim().length > 0).length > MAX_LIST_ITEMS);
}

export function validateHeadlineOptions(response: HeadlineOptionsResponse, request: HeadlineGenerationRequest): { label: string; headline: string }[] {
  const kept: { label: string; headline: string }[] = [];
  for (const raw of response.options) {
    const option = { label: raw.label.trim().slice(0, 40), headline: raw.headline.trim().replace(/\s+/g, " ") };
    if (option.headline.toLowerCase() === request.currentHeadline.trim().toLowerCase()) continue;
    if (!isGroundedHeadline(option.headline, request) || isKeywordList(option.headline)) continue;
    // The options must be different headlines, not one headline reworded.
    if (kept.some((other) => similarity(other.headline, option.headline) > MAX_HEADLINE_SIMILARITY)) continue;
    kept.push(option);
  }
  return kept.slice(0, MAX_OPTIONS);
}

const MAX_ABOUT_LENGTH = 2000;
const MIN_ABOUT_WORDS = 110;
const MAX_ABOUT_WORDS = 340;

export function validateAboutOptions(response: AboutOptionsResponse, request: AboutGenerationRequest): { label: string; text: string }[] {
  const sources = profileSources(request.profile, request.currentAbout, request.userContext, request.include, request.targetRole, request.standOut, request.additionalContext);
  const kept: { label: string; text: string }[] = [];
  for (const raw of response.options) {
    const text = raw.text.trim().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    const words = text.split(/\s+/).filter(Boolean).length;
    if (text.length > MAX_ABOUT_LENGTH || words < MIN_ABOUT_WORDS || words > MAX_ABOUT_WORDS) continue;
    if (!isGrounded(text, sources)) continue;
    if (kept.some((other) => similarity(other.text, text) > MAX_SIMILARITY)) continue;
    kept.push({ label: raw.label.trim().slice(0, 40), text });
  }
  return kept.slice(0, MAX_OPTIONS);
}
