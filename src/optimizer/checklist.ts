// Profile Optimizer checklists that LinkWise evaluates itself. Every criterion says how it can be
// known: checked locally from the profile's evidence, judged by AI from that evidence, or not
// knowable from what LinkWise can see (an image's quality, for example). Only the first two ever
// produce a pass or an improvement; the rest say so honestly.
import type { LinkedInProfile, ProfileListEntry } from "../models/profile";
import type { EvidencePayloadItem } from "../ai/evidencePayload";
import { extractMetrics } from "../savedProfiles/textCompare";
import type { OptimizerSection, SectionPresence } from "./sections";

export type VerificationType = "deterministic" | "semantic" | "visual" | "unverifiable";
export type CriterionStatus = "pass" | "improve" | "unverifiable" | "not_applicable";

export interface ChecklistContext {
  profile: LinkedInProfile;
  presence: SectionPresence;
  evidence: EvidencePayloadItem[];
}

interface CheckResult {
  status: CriterionStatus;
  explanation: string;
  evidenceIds?: string[];
}

export interface CriterionDefinition {
  id: string;
  label: string;
  verification: VerificationType;
  /** What good looks like, shown when LinkWise cannot check it and as guidance otherwise. */
  advice: string;
  check?: (context: ChecklistContext) => CheckResult;
}

export interface EvaluatedCriterion {
  id: string;
  label: string;
  verification: VerificationType;
  /** "checking" while the section's AI assessment is still running. */
  status: CriterionStatus | "checking";
  explanation: string;
  evidenceIds: string[];
}

export interface SemanticResult {
  criterionId: string;
  status: "pass" | "improve";
  explanation: string;
  evidenceIds: string[];
}

export type SemanticState = { status: "idle" | "loading" } | { status: "ready"; results: SemanticResult[] } | { status: "unavailable"; reason: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quoteList = (items: string[], max = 3) => items.slice(0, max).map((item) => `"${item}"`).join(", ") + (items.length > max ? ` and ${items.length - max} more` : "");
const idsOf = (context: ChecklistContext, section: string) => context.evidence.filter((item) => item.section === section).map((item) => item.id);

// Filler that tells a reader nothing about what the person does.
const FILLER = ["hardworking", "hard-working", "motivated", "passionate", "driven", "results-driven", "go-getter", "self-starter", "dynamic", "enthusiastic", "detail-oriented", "team player", "guru", "ninja", "rockstar", "visionary"];

function fillerIn(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLER.filter((word) => new RegExp(`(^|[^a-z-])${word.replace("-", "\\-")}($|[^a-z-])`).test(lower));
}

// Numbers that measure something ("300+ students", "95%", "$10,000"), not bare ones like a class
// year, nor LinkedIn's own "and +2 skills" tag on an entry.
function metricsIn(texts: string[]): string[] {
  return [...new Set(texts.flatMap((text) => extractMetrics(text).filter((metric) => metric.unit && metric.unit !== "skill").map((metric) => metric.text)))];
}

function listCount(context: ChecklistContext, entries: unknown[], noun: string, many?: string): CheckResult {
  const count = context.presence.itemCount ?? entries.length;
  return count > 0 ? { status: "pass", explanation: `${plural(count, noun, many)} listed.` } : { status: "improve", explanation: `No ${many ?? `${noun}s`} were found.` };
}

// Entries that carry more than a title, e.g. an issuer, a role, or a short description.
function describedEntries(entries: ProfileListEntry[], noun: string, sectionLabel: string): CheckResult {
  if (entries.length === 0) return { status: "unverifiable", explanation: `LinkWise hasn't read the entries in ${sectionLabel} yet.` };
  const bare = entries.filter((entry) => !entry.description || entry.description.trim().length < 15);
  if (bare.length === 0) return { status: "pass", explanation: `Every ${noun} includes details beyond its name.` };
  return { status: "improve", explanation: `${plural(bare.length, noun)} only show${bare.length === 1 ? "s" : ""} a name: ${quoteList(bare.map((e) => e.name ?? "untitled"))}.` };
}

const visual = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "visual", advice });
const semantic = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "semantic", advice });
const unverifiable = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "unverifiable", advice });

export const CHECKLISTS: Record<OptimizerSection, CriterionDefinition[]> = {
  photo: [
    {
      id: "photo-present",
      label: "Profile photo added",
      verification: "deterministic",
      advice: "Use a clear, recent photo of yourself.",
      check: (c) => (c.presence.present ? { status: "pass", explanation: "A profile photo is set." } : { status: "improve", explanation: "No profile photo was found." }),
    },
    visual("photo-face", "Face is easy to see", "Your face should be clear and fill most of the frame."),
    visual("photo-background", "Simple background", "Choose a background that doesn't compete with you."),
    visual("photo-solo", "Only you in the photo", "Avoid group photos or crops where it's unclear which person is you."),
    visual("photo-crop", "Works in the circular crop", "Check that the crop still works inside LinkedIn's circular frame."),
    visual("photo-presentation", "Matches how you want to present yourself", "Pick an image that fits the way you want to be seen professionally."),
  ],
  banner: [
    {
      id: "banner-custom",
      label: "Custom banner instead of LinkedIn's default",
      verification: "deterministic",
      advice: "Replace LinkedIn's default background with your own image.",
      check: (c) => (c.presence.present ? { status: "pass", explanation: "Your profile uses a custom banner image." } : { status: "improve", explanation: "Your profile shows LinkedIn's default background." }),
    },
    visual("banner-relevant", "Relevant to your field or work", "Make it relevant to your field, work, interests, or personal brand."),
    visual("banner-clean", "Visually clean, with little text", "Keep it clean, with little or no text."),
    visual("banner-photo-area", "Nothing important behind your photo", "Keep important details away from the lower-left area your photo covers."),
    visual("banner-quality", "Sharp, high-resolution image", "LinkedIn recommends 1584 × 396 pixels."),
    visual("banner-style", "Consistent colors and style", "Keep colors and style consistent with the impression you want to give."),
  ],
  headline: [
    {
      id: "headline-length",
      label: "Focused length",
      verification: "deterministic",
      advice: "You have up to 220 characters; a focused headline usually reads better than a full one.",
      check: (c) => {
        const length = (c.profile.headline ?? "").length;
        if (length < 30) return { status: "improve", explanation: `Your headline is only ${length} characters, which leaves out most of what you could say about your work.`, evidenceIds: idsOf(c, "headline") };
        return { status: "pass", explanation: `Your headline is ${length} of 220 characters.`, evidenceIds: idsOf(c, "headline") };
      },
    },
    {
      id: "headline-separators",
      label: "Not overloaded with separators",
      verification: "deterministic",
      advice: "A few separators can organize a headline; many make it read like a keyword list.",
      check: (c) => {
        const separators = (c.profile.headline ?? "").match(/[|•·]|\s\/\s|\s-\s/g)?.length ?? 0;
        return separators > 4
          ? { status: "improve", explanation: `Your headline uses ${separators} separators, so it reads more like a list than a statement.`, evidenceIds: idsOf(c, "headline") }
          : { status: "pass", explanation: separators === 0 ? "Your headline reads as one phrase." : `Your headline uses ${plural(separators, "separator")}, which keeps it organized.`, evidenceIds: idsOf(c, "headline") };
      },
    },
    {
      id: "headline-capitals",
      label: "Normal capitalization",
      verification: "deterministic",
      advice: "All-caps words read as shouting; keep capitals for names and acronyms.",
      check: (c) => {
        const shouted = (c.profile.headline ?? "").split(/\s+/).filter((word) => word.length >= 5 && /^[^a-z]*[A-Z][^a-z]*$/.test(word));
        return shouted.length >= 2
          ? { status: "improve", explanation: `${quoteList(shouted)} ${shouted.length === 1 ? "is" : "are"} in all capitals.`, evidenceIds: idsOf(c, "headline") }
          : { status: "pass", explanation: "Your headline uses normal capitalization.", evidenceIds: idsOf(c, "headline") };
      },
    },
    {
      id: "headline-filler",
      label: "No vague filler words",
      verification: "deterministic",
      advice: 'Nouns beat adjectives: "Full-stack web developer" says more than "driven, passionate innovator".',
      check: (c) => {
        const found = fillerIn(c.profile.headline ?? "");
        return found.length > 0
          ? { status: "improve", explanation: `${quoteList(found)} describe${found.length === 1 ? "s" : ""} a trait rather than what you do.`, evidenceIds: idsOf(c, "headline") }
          : { status: "pass", explanation: "Your headline avoids vague filler words.", evidenceIds: idsOf(c, "headline") };
      },
    },
    semantic("headline-direction", "States your role or direction", "Clearly state your current role or the direction you're targeting."),
    semantic("headline-expertise", "Includes searchable expertise", "Use a few skills or specialties people would realistically search for."),
    semantic("headline-differentiator", "Shows what sets you apart", "Show what sets you apart when space allows."),
    semantic("headline-readable", "Readable, not keyword stuffed", "Keep it readable for people, not just search."),
    semantic("headline-accurate", "Matches the rest of your profile", "Make sure every claim is supported by your profile."),
  ],
  about: [
    {
      id: "about-length",
      label: "Substantial length",
      verification: "deterministic",
      advice: "A few short paragraphs give readers context without becoming a wall of text.",
      check: (c) => {
        const words = (c.profile.about ?? "").split(/\s+/).filter(Boolean).length;
        if (words < 40) return { status: "improve", explanation: `Your About section is about ${words} words, which is too short to explain your focus and experience.`, evidenceIds: idsOf(c, "about") };
        if (words > 450) return { status: "improve", explanation: `Your About section is about ${words} words; readers may not get through all of it.`, evidenceIds: idsOf(c, "about") };
        return { status: "pass", explanation: `Your About section is about ${words} words.`, evidenceIds: idsOf(c, "about") };
      },
    },
    {
      id: "about-numbers",
      label: "Includes numbers or metrics",
      verification: "deterministic",
      advice: "Concrete numbers make accomplishments easier to believe.",
      check: (c) => {
        const found = metricsIn([c.profile.about ?? ""]);
        return found.length > 0
          ? { status: "pass", explanation: `Mentions ${quoteList(found)}.`, evidenceIds: idsOf(c, "about") }
          : { status: "improve", explanation: "Your About section has no numbers or measurable results.", evidenceIds: idsOf(c, "about") };
      },
    },
    unverifiable("about-paragraphs", "Uses short paragraphs", "Break the text into two to four short paragraphs so it is easy to scan."),
    semantic("about-who", "Explains who you are and your direction", "Open with who you are and what you're working toward."),
    semantic("about-expertise", "Names relevant expertise", "Mention the skills and areas you want to be known for."),
    semantic("about-evidence", "Backs claims with evidence", "Show what you've done instead of only describing yourself with adjectives."),
    semantic("about-accomplishments", "Highlights meaningful accomplishments", "Surface one or two of your strongest results."),
    semantic("about-differentiator", "Shows what sets you apart", "Say what makes your background or approach different."),
    semantic("about-specific", "Avoids generic statements", "Replace statements anyone could write with specifics about you."),
  ],
  featured: [
    {
      id: "featured-items",
      label: "Featured items added",
      verification: "deterministic",
      advice: "Feature your strongest work: projects, articles, websites, or demos.",
      check: (c) => {
        const count = c.presence.itemCount;
        return count ? { status: "pass", explanation: `${plural(count, "item")} featured.` } : { status: "pass", explanation: "Your profile has a Featured section." };
      },
    },
    unverifiable("featured-strongest", "Shows your strongest work", "Pin the work you'd most want someone to see first."),
    unverifiable("featured-current", "Items are current and working", "Remove outdated posts and check that links still open."),
  ],
  experience: [
    {
      id: "experience-entries",
      label: "Roles listed",
      verification: "deterministic",
      advice: "List jobs, internships, and other positions that show your experience.",
      check: (c) => listCount(c, c.profile.experience, "role"),
    },
    {
      id: "experience-descriptions",
      label: "Every role has a description",
      verification: "deterministic",
      advice: "A short description of what you did and achieved makes each role meaningful.",
      check: (c) => {
        const entries = c.profile.experience;
        if (entries.length === 0) return { status: "unverifiable", explanation: "LinkWise hasn't read your Experience entries yet." };
        const bare = entries.filter((entry) => !entry.description || entry.description.trim().length < 40);
        return bare.length === 0
          ? { status: "pass", explanation: `All ${plural(entries.length, "role")} include a description.`, evidenceIds: idsOf(c, "experience") }
          : { status: "improve", explanation: `${quoteList(bare.map((e) => e.title ?? "Untitled role"))} ${bare.length === 1 ? "has" : "have"} little or no description.`, evidenceIds: idsOf(c, "experience") };
      },
    },
    {
      id: "experience-metrics",
      label: "Includes measurable results",
      verification: "deterministic",
      advice: "Numbers such as people reached, results, or scale make impact concrete.",
      check: (c) => {
        const found = metricsIn(c.profile.experience.map((entry) => entry.description ?? ""));
        return found.length > 0
          ? { status: "pass", explanation: `Your roles mention ${quoteList(found)}.`, evidenceIds: idsOf(c, "experience") }
          : { status: "improve", explanation: "None of your role descriptions include numbers or measurable results.", evidenceIds: idsOf(c, "experience") };
      },
    },
    {
      id: "experience-current",
      label: "Current role shown",
      verification: "deterministic",
      advice: "Marking what you're doing now tells readers where you are today.",
      check: (c) => {
        const current = c.profile.experience.filter((entry) => /present/i.test(entry.dates ?? ""));
        if (c.profile.experience.length === 0) return { status: "unverifiable", explanation: "LinkWise hasn't read your Experience entries yet." };
        return current.length > 0
          ? { status: "pass", explanation: `Current: ${quoteList(current.map((e) => e.title ?? "Untitled role"))}.` }
          : { status: "improve", explanation: "None of your roles is marked as current." };
      },
    },
    semantic("experience-responsibility", "Explains your responsibilities", "Say what you owned, not just the job title."),
    semantic("experience-impact", "Communicates impact", "Lead with results: what changed because of your work."),
    semantic("experience-specific", "Technical work is specific", "Name what you built and the tools you used."),
    semantic("experience-not-vague", "Avoids vague job-description language", "Replace generic duties with what you actually did."),
  ],
  education: [
    {
      id: "education-schools",
      label: "Schools listed",
      verification: "deterministic",
      advice: "List the schools and programs relevant to your direction.",
      check: (c) => listCount(c, c.profile.education, "school"),
    },
    {
      id: "education-degree",
      label: "Degree or program shown",
      verification: "deterministic",
      advice: "Include the degree, program, or field for each school.",
      check: (c) => {
        const entries = c.profile.education;
        if (entries.length === 0) return { status: "unverifiable", explanation: "LinkWise hasn't read your Education entries yet." };
        const bare = entries.filter((entry) => !entry.degree);
        return bare.length === 0
          ? { status: "pass", explanation: `Every school shows a degree or program.`, evidenceIds: idsOf(c, "education") }
          : { status: "improve", explanation: `${quoteList(bare.map((e) => e.school ?? "A school"))} ${bare.length === 1 ? "has" : "have"} no degree or program listed.`, evidenceIds: idsOf(c, "education") };
      },
    },
    semantic("education-details", "Relevant details surfaced", "Add coursework, activities, or achievements that support your direction."),
  ],
  projects: [
    { id: "projects-entries", label: "Projects listed", verification: "deterministic", advice: "Add projects that show your skills in action.", check: (c) => listCount(c, c.profile.projects, "project") },
    {
      id: "projects-descriptions",
      label: "Every project has a description",
      verification: "deterministic",
      advice: "Describe what you built and why.",
      check: (c) => describedEntries(c.profile.projects, "project", "Projects"),
    },
    semantic("projects-built", "Explains what you built", "Say what the project does and what you made yourself."),
    semantic("projects-technologies", "Technologies are identifiable", "Name the languages, frameworks, or tools you used."),
    semantic("projects-impact", "Includes a result or impact", "Mention who used it, what it achieved, or what you learned."),
  ],
  skills: [
    {
      id: "skills-count",
      label: "Enough skills listed",
      verification: "deterministic",
      advice: "List the skills you actually use, so search and readers can find them.",
      check: (c) => {
        const count = c.presence.itemCount ?? c.profile.skills.length;
        return count >= 5 ? { status: "pass", explanation: `${plural(count, "skill")} listed.` } : { status: "improve", explanation: `Only ${plural(count, "skill")} listed.` };
      },
    },
    semantic("skills-direction", "Supports your direction", "Your skills should match the work you want to be known for."),
    semantic("skills-focus", "Not dominated by generic skills", "Prefer specific skills over very general ones."),
  ],
  certifications: [
    { id: "certifications-entries", label: "Certifications listed", verification: "deterministic", advice: "Add licenses and certifications relevant to your field.", check: (c) => listCount(c, c.profile.certifications, "certification") },
    {
      id: "certifications-details",
      label: "Issuer or details shown",
      verification: "deterministic",
      advice: "Include the issuing organization and date.",
      check: (c) => describedEntries(c.profile.certifications, "certification", "Licenses & Certifications"),
    },
    unverifiable("certifications-credential", "Credential can be verified", "Add a credential ID or URL where the issuer provides one."),
  ],
  volunteering: [
    { id: "volunteering-entries", label: "Volunteer roles listed", verification: "deterministic", advice: "Add volunteering that shows your values or skills.", check: (c) => listCount(c, c.profile.volunteering, "volunteer role") },
    {
      id: "volunteering-descriptions",
      label: "Roles have descriptions",
      verification: "deterministic",
      advice: "Describe what you did, not just where.",
      check: (c) => describedEntries(c.profile.volunteering, "volunteer role", "Volunteer Experience"),
    },
    semantic("volunteering-role", "Role and responsibility are clear", "Say what you were responsible for."),
    semantic("volunteering-impact", "Impact is communicated", "Mention who you helped or what changed."),
  ],
  honors: [
    { id: "honors-entries", label: "Awards listed", verification: "deterministic", advice: "Add awards, scholarships, and competition results.", check: (c) => listCount(c, c.profile.honors, "award") },
    {
      id: "honors-details",
      label: "Awards have context",
      verification: "deterministic",
      advice: "Say who gave the award and what it was for.",
      check: (c) => describedEntries(c.profile.honors, "award", "Honors & Awards"),
    },
  ],
  organizations: [
    { id: "organizations-entries", label: "Organizations listed", verification: "deterministic", advice: "Add clubs, associations, and teams you belong to.", check: (c) => listCount(c, c.profile.organizations, "organization") },
    {
      id: "organizations-details",
      label: "Your role is shown",
      verification: "deterministic",
      advice: "Include your position or contribution in each organization.",
      check: (c) => describedEntries(c.profile.organizations, "organization", "Organizations"),
    },
  ],
  languages: [
    { id: "languages-entries", label: "Languages listed", verification: "deterministic", advice: "List every language you can work in.", check: (c) => listCount(c, c.profile.languages, "language") },
    {
      id: "languages-proficiency",
      label: "Proficiency shown",
      verification: "deterministic",
      advice: "Add a proficiency level so readers know how well you speak each language.",
      check: (c) => {
        const entries = c.profile.languages;
        if (entries.length === 0) return { status: "unverifiable", explanation: "LinkWise hasn't read your Languages entries yet." };
        const missing = entries.filter((entry) => !entry.description);
        return missing.length === 0
          ? { status: "pass", explanation: `Every language shows a proficiency level.`, evidenceIds: idsOf(c, "languages") }
          : { status: "improve", explanation: `${quoteList(missing.map((e) => e.name ?? "A language"))} ${missing.length === 1 ? "has" : "have"} no proficiency level.`, evidenceIds: idsOf(c, "languages") };
      },
    },
  ],
  location: [
    {
      id: "location-specific",
      label: "Specific city or region",
      verification: "deterministic",
      advice: "A city or metro area helps people and recruiters find you locally.",
      check: (c) => {
        const location = c.profile.location ?? "";
        return location.includes(",")
          ? { status: "pass", explanation: `Shows "${location}".`, evidenceIds: idsOf(c, "location") }
          : { status: "improve", explanation: `"${location}" doesn't name a city or region.`, evidenceIds: idsOf(c, "location") };
      },
    },
    unverifiable("location-target", "Matches where you want to work", "Use the location where you want opportunities."),
  ],
};

export function semanticCriteria(section: OptimizerSection): CriterionDefinition[] {
  return CHECKLISTS[section].filter((criterion) => criterion.verification === "semantic");
}

const CANT_VERIFY: Record<Exclude<VerificationType, "deterministic" | "semantic">, string> = {
  visual: "Can't verify automatically: LinkWise doesn't analyze the image itself.",
  unverifiable: "Can't verify automatically from what LinkedIn shows.",
};

// The reason given when a section has no text for AI to read.
export const NO_SECTION_TEXT = "no_section_text";

export function evaluateChecklist(section: OptimizerSection, context: ChecklistContext, semanticState: SemanticState): EvaluatedCriterion[] {
  return CHECKLISTS[section].map((criterion): EvaluatedCriterion => {
    const base = { id: criterion.id, label: criterion.label, verification: criterion.verification, evidenceIds: [] as string[] };
    if (criterion.verification === "deterministic") {
      const result = criterion.check!(context);
      return { ...base, status: result.status, explanation: result.explanation, evidenceIds: result.evidenceIds ?? [] };
    }
    if (criterion.verification === "semantic") {
      if (semanticState.status === "ready") {
        const result = semanticState.results.find((r) => r.criterionId === criterion.id);
        return result
          ? { ...base, status: result.status, explanation: result.explanation, evidenceIds: result.evidenceIds }
          : { ...base, status: "unverifiable", explanation: "LinkWise couldn't assess this reliably from your profile." };
      }
      if (semanticState.status === "unavailable") {
        const explanation = semanticState.reason === NO_SECTION_TEXT ? "LinkWise hasn't read this section's text yet." : "AI assessment is unavailable right now.";
        return { ...base, status: "unverifiable", explanation };
      }
      return { ...base, status: "checking", explanation: "Checking…" };
    }
    return { ...base, status: "unverifiable", explanation: CANT_VERIFY[criterion.verification] };
  });
}

export type ChecklistState = "strong" | "improve" | "missing";

export interface ChecklistSummary {
  state: ChecklistState | null;
  passed: number;
  verifiable: number;
  checking: boolean;
}

// The section's status, from its checklist alone. Criteria LinkWise can't verify never count.
export function summarizeChecklist(present: boolean, criteria: EvaluatedCriterion[]): ChecklistSummary {
  const passed = criteria.filter((c) => c.status === "pass").length;
  const verifiable = passed + criteria.filter((c) => c.status === "improve").length;
  const checking = criteria.some((c) => c.status === "checking");
  if (!present) return { state: "missing", passed, verifiable, checking: false };
  const state: ChecklistState | null = passed < verifiable ? "improve" : checking ? null : verifiable > 0 ? "strong" : null;
  return { state, passed, verifiable, checking };
}

// Evidence a section's AI assessment reads: the section itself plus what shows the person's direction.
export const SEMANTIC_CONTEXT: Partial<Record<OptimizerSection, string[]>> = {
  headline: ["headline", "about", "experience"],
  about: ["about", "headline"],
  experience: ["experience", "headline"],
  education: ["education", "headline"],
  projects: ["projects", "headline", "skills"],
  skills: ["skills", "headline", "experience"],
  volunteering: ["volunteering", "headline"],
};
