// Profile Optimizer checklists that LinkWise evaluates itself. Every criterion says how it can be
// known: checked locally from the profile's evidence, judged by AI from that evidence, or not
// knowable from what LinkWise can see (an image's quality, for example). Only the first two ever
// produce a pass or an improvement; the rest say so honestly.
import type { LinkedInProfile, ProfileListEntry } from "../models/profile";
import type { EvidencePayloadItem } from "../ai/evidencePayload";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { extractMetrics } from "../savedProfiles/textCompare";
import type { OptimizerSection, SectionPresence } from "./sections";

export type VerificationType = "deterministic" | "semantic" | "visual" | "unverifiable";
export type CriterionStatus = "pass" | "improve" | "unverifiable" | "not_applicable";

export interface ChecklistContext {
  profile: LinkedInProfile;
  presence: SectionPresence;
  evidence: EvidencePayloadItem[];
  /** What the page shows beyond profile text: connections, Open to Work, and so on. */
  shell?: ProfileShell;
  profileKey?: string | null;
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
  /** What good looks like, sent to the AI with semantic criteria and shown when LinkWise can't check it. */
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
const YEAR = /\b(19|20)\d{2}\b/;

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

function present(label: string, noun: string): CriterionDefinition {
  return {
    id: `${noun}-present`,
    label,
    verification: "deterministic",
    advice: label,
    check: (c) => {
      const count = c.presence.itemCount;
      return { status: "pass", explanation: count ? `${plural(count, "entry", "entries")} listed.` : "The section is on your profile." };
    },
  };
}

function notRead(sectionLabel: string): CheckResult {
  return { status: "unverifiable", explanation: `LinkWise hasn't read the entries in ${sectionLabel} yet.` };
}

// Entries that carry more than a name, e.g. an issuer, a role, or a short description.
function describedEntries(entries: ProfileListEntry[], noun: string, sectionLabel: string): CheckResult {
  if (entries.length === 0) return notRead(sectionLabel);
  const bare = entries.filter((entry) => !entry.description || entry.description.trim().length < 15);
  if (bare.length === 0) return { status: "pass", explanation: `Every ${noun} includes details beyond its name.` };
  return { status: "improve", explanation: `${quoteList(bare.map((e) => e.name ?? "untitled"))} ${bare.length === 1 ? "shows" : "show"} only a name.` };
}

function namedEntries(entries: ProfileListEntry[], noun: string, sectionLabel: string): CheckResult {
  if (entries.length === 0) return notRead(sectionLabel);
  const unnamed = entries.filter((entry) => !entry.name || entry.name.trim().length < 3).length;
  return unnamed === 0
    ? { status: "pass", explanation: `${plural(entries.length, noun)} with clear names, such as ${quoteList(entries.map((e) => e.name!), 2)}.` }
    : { status: "improve", explanation: `${plural(unnamed, noun)} ${unnamed === 1 ? "has" : "have"} no clear name.` };
}

function datedEntries(entries: ProfileListEntry[], noun: string, sectionLabel: string): CheckResult {
  if (entries.length === 0) return notRead(sectionLabel);
  const undated = entries.filter((entry) => !YEAR.test(entry.description ?? ""));
  return undated.length === 0
    ? { status: "pass", explanation: `Every ${noun} shows a date.` }
    : { status: "improve", explanation: `${quoteList(undated.map((e) => e.name ?? "untitled"))} ${undated.length === 1 ? "has" : "have"} no date.` };
}

const visual = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "visual", advice });
const semantic = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "semantic", advice });
const unverifiable = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "unverifiable", advice });

// LinkedIn appends a generated ID to default profile URLs, e.g. "jordan-rivera-834725198" or "-a804a7327".
const GENERATED_SUFFIX = /-(?=[a-z0-9]*\d)[a-z0-9]{6,}$/i;

export function evaluateProfileUrl(slug: string | null | undefined): { custom: CheckResult; readable: CheckResult } | null {
  if (!slug) return null;
  const suffix = GENERATED_SUFFIX.exec(slug)?.[0].slice(1);
  const custom: CheckResult = suffix
    ? { status: "improve", explanation: `Your URL ends with "${suffix}", the ID LinkedIn adds by default.` }
    : { status: "pass", explanation: `Your URL is linkedin.com/in/${slug}.` };
  const readable: CheckResult =
    slug.length <= 30 && !/\d{4,}/.test(slug)
      ? { status: "pass", explanation: `"${slug}" is short and easy to type.` }
      : { status: "improve", explanation: `"${slug}" is long or number-heavy, which makes it harder to share.` };
  return { custom, readable };
}

export function evaluateNetwork(connections: string | null | undefined, followers?: number | null): CheckResult {
  if (!connections) return { status: "unverifiable", explanation: "LinkWise couldn't read your connection count on this page." };
  const count = Number(connections.replace(/[,+]/g, ""));
  const also = followers ? ` and ${followers.toLocaleString("en-US")} followers` : "";
  // Context, not a threshold: a small network is a note, not a failure, and 500+ is LinkedIn's own cap on the display.
  if (connections.endsWith("+") || count >= 100) return { status: "pass", explanation: `Your profile shows ${connections} connections${also}.` };
  return { status: "improve", explanation: `Your profile shows ${connections} connections${also}. Connecting with classmates, colleagues, and people in your field can make you easier to find.` };
}

export const CHECKLISTS: Record<OptimizerSection, CriterionDefinition[]> = {
  photo: [
    {
      id: "photo-present",
      label: "Profile photo added",
      verification: "deterministic",
      advice: "Use a clear, recent photo of yourself.",
      check: () => ({ status: "pass", explanation: "Your profile shows your own photo, not LinkedIn's default placeholder." }),
    },
    visual("photo-face", "Face is clear and easy to see", "Your face should be clear and fill most of the frame."),
    visual("photo-lighting", "Good lighting", "Even, natural light works best."),
    visual("photo-background", "Simple background", "Choose a background that doesn't compete with you."),
    visual("photo-solo", "Only you in the photo", "Avoid group photos or crops where it's unclear which person is you."),
    visual("photo-professional", "Professional appearance", "Dress the way you would for the work you want."),
    visual("photo-crop", "Works in the circular crop", "Check the crop inside LinkedIn's circular frame."),
  ],
  banner: [
    {
      id: "banner-custom",
      label: "Custom banner instead of LinkedIn's default",
      verification: "deterministic",
      advice: "Replace LinkedIn's default background with your own image.",
      check: () => ({ status: "pass", explanation: "Your profile uses its own banner image." }),
    },
    visual("banner-relevant", "Supports your professional positioning", "Make it relevant to your field, work, or interests."),
    visual("banner-clean", "Visually clean, with little text", "Keep it simple, with little or no text."),
    visual("banner-photo-area", "Nothing important behind your photo", "Keep important details away from the lower-left area your photo covers."),
    visual("banner-quality", "Sharp, high-resolution image", "LinkedIn recommends 1584 × 396 pixels."),
  ],
  headline: [
    {
      id: "headline-present",
      label: "Headline added",
      verification: "deterministic",
      advice: "Add a short line about what you do.",
      check: (c) => ({ status: "pass", explanation: `"${c.profile.headline}"`, evidenceIds: idsOf(c, "headline") }),
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
      id: "headline-filler",
      label: "Avoids vague filler",
      verification: "deterministic",
      advice: 'Nouns beat adjectives: "Full-stack web developer" says more than "driven, passionate innovator".',
      check: (c) => {
        const found = fillerIn(c.profile.headline ?? "");
        return found.length > 0
          ? { status: "improve", explanation: `${quoteList(found)} describe${found.length === 1 ? "s" : ""} a trait rather than what you do.`, evidenceIds: idsOf(c, "headline") }
          : { status: "pass", explanation: "No vague filler words.", evidenceIds: idsOf(c, "headline") };
      },
    },
    semantic("headline-direction", "Professional direction is clear", "States the current role or the direction the person is targeting."),
    semantic("headline-keywords", "Relevant searchable keywords", "Uses role or skill terms people would realistically search for."),
    semantic("headline-specialization", "Communicates a specialization", "Names a focus area rather than only a generic role."),
    semantic("headline-differentiator", "Shows what sets you apart", "Includes differentiating evidence where appropriate, such as a notable credential or result."),
    semantic("headline-readable", "Readable, not keyword stuffed", "Reads as a phrase for people, not a list for search."),
    semantic("headline-grounded", "Grounded in your profile", "Every claim is supported by the rest of the profile."),
  ],
  about: [
    {
      id: "about-present",
      label: "About section added",
      verification: "deterministic",
      advice: "Add a few sentences about your focus and experience.",
      check: (c) => ({ status: "pass", explanation: `About ${(c.profile.about ?? "").split(/\s+/).filter(Boolean).length} words.`, evidenceIds: idsOf(c, "about") }),
    },
    semantic("about-who", "Explains who you are", "Opens with who the person is."),
    semantic("about-direction", "Communicates your direction", "Says what the person is working toward."),
    semantic("about-expertise", "Mentions relevant expertise", "Names the skills and areas the person wants to be known for."),
    semantic("about-evidence", "Includes concrete evidence", "Shows what the person has done rather than only describing themselves."),
    semantic("about-measurable", "Includes measurable results where available", "Uses a number for a result the text already describes, when one is available."),
    semantic("about-differentiator", "Contains differentiating information", "Says what makes the background or approach different."),
    semantic("about-adjectives", "Avoids excessive generic adjectives", "Relies on specifics rather than adjectives like passionate or driven."),
    semantic("about-readable", "Easy to read at its length", "Is focused and easy to scan for its length; not padded and not too thin to be useful."),
    unverifiable("about-paragraphs", "Uses short paragraphs", "Break the text into short paragraphs so it is easy to scan."),
  ],
  featured: [
    present("Featured section added", "featured"),
    {
      id: "featured-items",
      label: "Contains at least one item",
      verification: "deterministic",
      advice: "Feature at least one piece of work.",
      check: (c) => {
        const count = c.presence.itemCount;
        if (count === null) return { status: "unverifiable", explanation: "LinkWise sees the section but can't count its items." };
        return count > 0 ? { status: "pass", explanation: `${plural(count, "item")} featured.` } : { status: "improve", explanation: "The section has no items." };
      },
    },
    unverifiable("featured-direction", "Items support your direction", "Feature work related to what you want to be known for."),
    unverifiable("featured-strongest", "Your strongest work is represented", "Put the strongest, most relevant item first."),
    unverifiable("featured-media", "Useful links or media", "Include projects, portfolio links, articles, or presentations people can open."),
  ],
  experience: [
    present("Experience section added", "experience"),
    {
      id: "experience-descriptions",
      label: "Roles have descriptions",
      verification: "deterministic",
      advice: "Describe what you did and achieved in each role.",
      check: (c) => {
        const entries = c.profile.experience;
        if (entries.length === 0) return notRead("Experience");
        const bare = entries.filter((entry) => !entry.description || entry.description.trim().length < 40);
        return bare.length === 0
          ? { status: "pass", explanation: `All ${plural(entries.length, "role")} include a description.`, evidenceIds: idsOf(c, "experience") }
          : { status: "improve", explanation: `${quoteList(bare.map((e) => e.title ?? "Untitled role"))} ${bare.length === 1 ? "has" : "have"} little or no description.`, evidenceIds: idsOf(c, "experience") };
      },
    },
    {
      id: "experience-metrics",
      label: "Measurable impact appears",
      verification: "deterministic",
      advice: "Numbers such as people reached, results, or scale make impact concrete.",
      check: (c) => {
        if (c.profile.experience.length === 0) return notRead("Experience");
        const found = metricsIn(c.profile.experience.map((entry) => entry.description ?? ""));
        return found.length > 0
          ? { status: "pass", explanation: `Your roles mention ${quoteList(found)}.`, evidenceIds: idsOf(c, "experience") }
          : { status: "improve", explanation: "None of your role descriptions include a measurable result.", evidenceIds: idsOf(c, "experience") };
      },
    },
    semantic("experience-responsibilities", "Responsibilities are specific", "Descriptions say what the person was responsible for, specifically."),
    semantic("experience-accomplishments", "Accomplishments are included", "Descriptions include what was achieved, not only duties."),
    semantic("experience-ownership", "Your contribution is clear", "Makes clear what the person did or owned, not only what the team did."),
    semantic("experience-technical", "Tools and technologies are specific", "Names the tools, technologies, or methods used, where relevant to the role."),
    semantic("experience-not-generic", "Avoids generic job-description wording", "Avoids generic duties that could appear in any job posting."),
    unverifiable("experience-media", "Attached media", "LinkWise can't evaluate the quality of media attached to roles."),
  ],
  education: [
    present("Education section added", "education"),
    {
      id: "education-institution",
      label: "Institutions are clear",
      verification: "deterministic",
      advice: "Name each school or program provider.",
      check: (c) => {
        const entries = c.profile.education;
        if (entries.length === 0) return notRead("Education");
        const unnamed = entries.filter((entry) => !entry.school).length;
        return unnamed === 0
          ? { status: "pass", explanation: `Lists ${quoteList(entries.map((e) => e.school!))}.`, evidenceIds: idsOf(c, "education") }
          : { status: "improve", explanation: `${plural(unnamed, "entry", "entries")} ${unnamed === 1 ? "has" : "have"} no school name.` };
      },
    },
    {
      id: "education-degree",
      label: "Degree, program, or field shown",
      verification: "deterministic",
      advice: "Include the degree, program, or field where you have one.",
      check: (c) => {
        const entries = c.profile.education;
        if (entries.length === 0) return notRead("Education");
        const bare = entries.filter((entry) => !entry.degree);
        return bare.length === 0
          ? { status: "pass", explanation: "Every school shows a degree, program, or field.", evidenceIds: idsOf(c, "education") }
          : { status: "improve", explanation: `${quoteList(bare.map((e) => e.school ?? "A school"))} ${bare.length === 1 ? "has" : "have"} no degree, program, or field.`, evidenceIds: idsOf(c, "education") };
      },
    },
    semantic("education-activities", "Activities or organizations included where useful", "Mentions relevant activities, clubs, or organizations where they add context."),
    semantic("education-achievements", "Achievements included where relevant", "Mentions honors or achievements where they are relevant; grades are not required."),
    semantic("education-useful", "Descriptions add useful information", "Descriptions add specifics rather than filler."),
  ],
  projects: [
    present("Projects section added", "projects"),
    semantic("projects-purpose", "Purpose is understandable", "Says what each project does and why."),
    semantic("projects-contribution", "Your contribution is clear", "Makes the person's own part clear."),
    semantic("projects-technologies", "Technologies are identifiable", "Names the languages, frameworks, or tools used."),
    semantic("projects-result", "Result or impact is stated where possible", "States who used it, what it achieved, or what came of it."),
    semantic("projects-direction", "Strongest projects support your direction", "The most prominent projects relate to the person's direction."),
    unverifiable("projects-links", "Links, demo, or repository", "LinkWise doesn't read the links attached to projects."),
  ],
  skills: [
    present("Skills section added", "skills"),
    semantic("skills-relevant", "Relevant core skills are present", "Lists the technical or core skills that matter for the person's direction."),
    semantic("skills-direction", "Strongest skills match your direction", "The first skills listed align with the person's direction."),
    semantic("skills-focus", "Not dominated by general skills", "Specific skills outnumber very general ones."),
    semantic("skills-supported", "Supported by your experience or projects", "Listed skills also appear in Experience, Projects, or the headline."),
  ],
  certifications: [
    present("Certifications section added", "certifications"),
    { id: "certifications-named", label: "Names are clear", verification: "deterministic", advice: "Use each credential's exact name.", check: (c) => namedEntries(c.profile.certifications, "certification", "Licenses & Certifications") },
    { id: "certifications-issuer", label: "Issuing organization shown", verification: "deterministic", advice: "Add the issuer.", check: (c) => describedEntries(c.profile.certifications, "certification", "Licenses & Certifications") },
    { id: "certifications-dates", label: "Issue date shown", verification: "deterministic", advice: "Add the issue date, and the expiration date if it has one.", check: (c) => datedEntries(c.profile.certifications, "certification", "Licenses & Certifications") },
    unverifiable("certifications-credential", "Credential ID or URL where relevant", "Add a credential ID or link when the issuer provides one; it isn't required."),
    semantic("certifications-direction", "Support your direction", "The certifications relate to the person's field or direction."),
  ],
  volunteering: [
    present("Volunteer Experience section added", "volunteering"),
    { id: "volunteering-details", label: "Organization and details shown", verification: "deterministic", advice: "Name the organization and describe the role.", check: (c) => describedEntries(c.profile.volunteering, "volunteer role", "Volunteer Experience") },
    semantic("volunteering-role", "Your role is clear", "Each entry makes the person's role clear."),
    semantic("volunteering-contribution", "Contribution is explained", "Describes what the person actually did."),
    semantic("volunteering-impact", "Impact is included where possible", "Mentions who was helped or what changed."),
    semantic("volunteering-cause", "Cause or context is clear", "Makes the cause or organization's purpose clear where useful."),
  ],
  honors: [
    present("Honors & Awards section added", "honors"),
    { id: "honors-named", label: "Award names are clear", verification: "deterministic", advice: "Use each award's exact name.", check: (c) => namedEntries(c.profile.honors, "award", "Honors & Awards") },
    { id: "honors-context", label: "Issuer or context shown", verification: "deterministic", advice: "Say who gave the award.", check: (c) => describedEntries(c.profile.honors, "award", "Honors & Awards") },
    { id: "honors-dates", label: "Date shown", verification: "deterministic", advice: "Add the date when it helps.", check: (c) => datedEntries(c.profile.honors, "award", "Honors & Awards") },
    semantic("honors-significance", "Significance is understandable", "A reader can tell what each award recognized and why it matters."),
  ],
  organizations: [
    present("Organizations section added", "organizations"),
    { id: "organizations-named", label: "Organizations are identified", verification: "deterministic", advice: "Name each organization.", check: (c) => namedEntries(c.profile.organizations, "organization", "Organizations") },
    { id: "organizations-role", label: "Role or membership shown", verification: "deterministic", advice: "Include your position or membership status.", check: (c) => describedEntries(c.profile.organizations, "organization", "Organizations") },
    semantic("organizations-leadership", "Leadership highlighted where relevant", "Leadership positions are visible where the person holds them."),
    semantic("organizations-contribution", "Contribution shown where appropriate", "Mentions what the person contributed when it is notable."),
  ],
  languages: [
    present("Languages section added", "languages"),
    {
      id: "languages-proficiency",
      label: "Proficiency shown",
      verification: "deterministic",
      advice: "Add a proficiency level for each language.",
      check: (c) => {
        const entries = c.profile.languages;
        if (entries.length === 0) return notRead("Languages");
        const missing = entries.filter((entry) => !entry.description);
        return missing.length === 0
          ? { status: "pass", explanation: `${quoteList(entries.map((e) => e.name!))}, each with a proficiency level.`, evidenceIds: idsOf(c, "languages") }
          : { status: "improve", explanation: `${quoteList(missing.map((e) => e.name ?? "A language"))} ${missing.length === 1 ? "has" : "have"} no proficiency level.`, evidenceIds: idsOf(c, "languages") };
      },
    },
    {
      id: "languages-unique",
      label: "Each language listed once",
      verification: "deterministic",
      advice: "Keep one entry per language.",
      check: (c) => {
        const names = c.profile.languages.map((e) => (e.name ?? "").trim().toLowerCase()).filter(Boolean);
        if (names.length === 0) return notRead("Languages");
        const duplicates = [...new Set(names.filter((name, i) => names.indexOf(name) !== i))];
        return duplicates.length === 0 ? { status: "pass", explanation: "No language appears twice." } : { status: "improve", explanation: `${quoteList(duplicates)} appear${duplicates.length === 1 ? "s" : ""} more than once.` };
      },
    },
  ],
  location: [
    {
      id: "location-present",
      label: "Location added",
      verification: "deterministic",
      advice: "Add where you're based.",
      check: (c) => ({ status: "pass", explanation: `"${c.profile.location}"`, evidenceIds: idsOf(c, "location") }),
    },
    {
      id: "location-specific",
      label: "Specific enough for local discovery",
      verification: "deterministic",
      advice: "A city or metro area helps people find you locally.",
      check: (c) => {
        const location = c.profile.location ?? "";
        return location.includes(",")
          ? { status: "pass", explanation: "Names a city or region, not only a country.", evidenceIds: idsOf(c, "location") }
          : { status: "improve", explanation: `"${location}" doesn't name a city or region.`, evidenceIds: idsOf(c, "location") };
      },
    },
    unverifiable("location-target", "Fits where you want opportunities", "LinkWise doesn't know where you want to work, so it never suggests changing where you live."),
  ],
  url: [
    {
      id: "url-present",
      label: "Public profile URL",
      verification: "deterministic",
      advice: "Your profile has a public URL.",
      check: (c) => (c.profileKey ? { status: "pass", explanation: `linkedin.com/in/${c.profileKey}` } : { status: "unverifiable", explanation: "LinkWise couldn't read your profile URL." }),
    },
    {
      id: "url-custom",
      label: "Customized, without a generated ID",
      verification: "deterministic",
      advice: "Claim a custom URL in your public profile settings.",
      check: (c) => evaluateProfileUrl(c.profileKey)?.custom ?? { status: "unverifiable", explanation: "LinkWise couldn't read your profile URL." },
    },
    {
      id: "url-readable",
      label: "Clean and readable",
      verification: "deterministic",
      advice: "A short, readable URL is easier to share.",
      check: (c) => evaluateProfileUrl(c.profileKey)?.readable ?? { status: "unverifiable", explanation: "LinkWise couldn't read your profile URL." },
    },
  ],
  openToWork: [
    {
      id: "otw-status",
      label: "Open to Work status",
      verification: "deterministic",
      advice: "Turn it on only if you're looking for opportunities.",
      check: (c) => {
        const status = c.shell?.openToWork;
        if (status === "shown") return { status: "pass", explanation: "Your profile shows that you're Open to Work." };
        if (status === "not_shown") return { status: "not_applicable", explanation: "Not shown on your profile. It's optional; use it only if you're looking." };
        return { status: "unverifiable", explanation: "LinkWise couldn't find your Open to Work status on this page." };
      },
    },
    unverifiable("otw-roles", "Job titles and locations", "LinkWise doesn't read the preferences inside Open to Work."),
    unverifiable("otw-recruiters", "Recruiter-only Open to Work", "Can't verify recruiter-only Open to Work settings: LinkedIn shows those only to recruiters."),
  ],
  network: [
    {
      id: "network-size",
      label: "Established LinkedIn network",
      verification: "deterministic",
      advice: "Connect with people you know and trust.",
      check: (c) => evaluateNetwork(c.shell?.connections, c.shell?.followers),
    },
    unverifiable("network-relevant", "Connections in your field", "LinkWise can't see who your connections are."),
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
        const explanation = semanticState.reason === NO_SECTION_TEXT ? "LinkWise hasn't read this section's text yet." : semanticState.reason.startsWith("LinkWise") ? semanticState.reason : "AI assessment is unavailable right now.";
        return { ...base, status: "unverifiable", explanation };
      }
      return { ...base, status: "checking", explanation: "Checking…" };
    }
    const advice = criterion.verification === "unverifiable" && /^(LinkWise|Can.t)/.test(criterion.advice) ? criterion.advice : CANT_VERIFY[criterion.verification];
    return { ...base, status: "unverifiable", explanation: advice };
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
  skills: ["skills", "headline", "experience", "projects"],
  certifications: ["certifications", "headline"],
  volunteering: ["volunteering", "headline"],
  honors: ["honors", "headline"],
  organizations: ["organizations", "headline"],
};

// Sections that are settings rather than profile sections: always shown, never "missing".
export const SETTING_SECTIONS: OptimizerSection[] = ["url", "openToWork", "network"];
