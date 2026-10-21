// Profile Optimizer checklists. Every criterion says how it can be known: checked locally from the
// profile's evidence, judged by AI from that evidence, confirmed by the user (what a photo or banner
// looks like, which only a person can judge), or not knowable from what LinkWise can see. The user's
// answers count like any other result, but always as theirs: "Confirmed by you", never a detection.
import type { LinkedInProfile, ProfileListEntry } from "../models/profile";
import type { EvidencePayloadItem } from "../ai/evidencePayload";
import type { ProfileShell } from "../linkedin/profileAdapter";
import { extractMetrics } from "../savedProfiles/textCompare";
import type { OptimizerSection, SectionPresence } from "./sections";

export type VerificationType = "deterministic" | "semantic" | "user" | "unverifiable";
/** "needs_user": waiting for the user's own check; it never counts as a pass or a failure. */
export type CriterionStatus = "pass" | "improve" | "needs_user" | "unverifiable" | "not_applicable";

export interface ChecklistContext {
  profile: LinkedInProfile;
  presence: SectionPresence;
  evidence: EvidencePayloadItem[];
  /** What the page shows beyond profile text: connections, Open to Work, and so on. */
  shell?: ProfileShell;
  profileKey?: string | null;
  /** The user's own answers to "user" criteria, by criterion id; missing means not answered yet. */
  answers?: Record<string, boolean>;
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
  /** What good looks like: sent to the AI with semantic criteria, and for "user" criteria the
   * instruction telling the user what to look at. */
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
  /** The user's own answer, which overrides any automatic result; null while they haven't answered. */
  userValue?: boolean | null;
  /** What LinkWise found by itself, kept when the user's answer overrides it. */
  automatic?: { status: CriterionStatus | "checking"; explanation: string };
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

// Wording that describes a result, even without a number: what changed or what came of the work.
const OUTCOME_LANGUAGE = /\b(resulting in|resulted in|led to|allowing|allowed|enabling|enabled|so that|used by|served|reached|increased|reduced|improved|grew|saved|raised|launched|delivered|generated|won|placed|ranked|qualified|achieved|independently|adopted|helped (?:\w+\s){1,3}(?:to|achieve|learn|improve|get|win))\b/i;
const hasOutcomeLanguage = (text: string | undefined) => OUTCOME_LANGUAGE.test(text ?? "");

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
      const total = c.presence.itemCount;
      // How much of the list LinkWise actually read, next to what LinkedIn says it holds.
      const list = (c.profile as unknown as Record<string, unknown>)[noun];
      const read = Array.isArray(list) ? list.length : 0;
      if (total && read > 0) return { status: "pass", explanation: `${read} of ${plural(total, "entry", "entries")} read.` };
      return { status: "pass", explanation: total ? `${plural(total, "entry", "entries")} listed.` : "The section is on your profile." };
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

const userCheck = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "user", advice });
const semantic = (id: string, label: string, advice: string): CriterionDefinition => ({ id, label, verification: "semantic", advice });

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
    userCheck("photo-face", "Face is clear and easy to see", "Check that your face is clearly visible at normal profile size."),
    userCheck("photo-lighting", "Good lighting", "Check that your face is evenly lit, without heavy shadows."),
    userCheck("photo-background", "Simple background", "Check that the background is clean and doesn't distract from you."),
    userCheck("photo-solo", "Only you in the photo", "Check that you're the only clearly featured person."),
    userCheck("photo-professional", "Professional appearance", "Check that it fits how you want to present yourself professionally."),
    userCheck("photo-crop", "Works in the circular crop", "Check that your face stays clearly visible in LinkedIn's circular crop."),
  ],
  banner: [
    {
      id: "banner-custom",
      label: "Custom banner instead of LinkedIn's default",
      verification: "deterministic",
      advice: "Replace LinkedIn's default background with your own image.",
      check: () => ({ status: "pass", explanation: "Your profile uses its own banner image." }),
    },
    userCheck("banner-quality", "Sharp, clear image", "Check that it looks crisp, not blurry or stretched (LinkedIn recommends 1584 × 396)."),
    userCheck("banner-photo-area", "Nothing important behind your photo", "Check that key text or graphics stay visible next to your profile photo."),
    userCheck("banner-text", "Any text is easy to read", "Check that any text in the banner is easy to read at a glance."),
    userCheck("banner-clean", "Clean, uncluttered design", "Check that the design is simple and doesn't feel busy."),
    userCheck("banner-relevant", "Supports your professional direction", "Check that it fits your field, work, or professional identity."),
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
    semantic("about-evidence", "Includes concrete accomplishments", "Shows what the person has actually done or built rather than only describing themselves."),
    semantic("about-measurable", "Shows measurable impact", "Names a result, scale, or outcome from the person's work, with a number where one exists. Impact described in words counts too."),
    semantic("about-leadership", "Demonstrates leadership or ownership when supported", "If the evidence shows the person led, owned, taught, or captained something, the About says what they led and what happened. If the evidence shows none, this is met."),
    semantic("about-connection", "Connects experience to current direction", "Links the person's background to what they are working toward now."),
    semantic("about-differentiator", "Contains differentiating information", "Says what makes the background or approach different."),
    semantic("about-adjectives", "Avoids excessive generic adjectives", "Relies on specifics rather than adjectives like passionate or driven."),
    semantic("about-readable", "Easy to read at its length", "Is focused and easy to scan for its length; not padded and not too thin to be useful."),
    userCheck("about-paragraphs", "Uses short paragraphs", "Check that your About is split into short paragraphs that are easy to scan."),
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
    userCheck("featured-direction", "Items support your direction", "Check that your featured items support what you want to be known for."),
    userCheck("featured-strongest", "Your strongest work is represented", "Check that your strongest, most relevant item comes first."),
    userCheck("featured-media", "Useful links or media", "Check that people can open useful projects, links, articles, or presentations from it."),
    userCheck("featured-impact", "Shows proof of impact", "Check that your featured items show measurable accomplishments or other proof of impact."),
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
      label: "Measurable impact is shown",
      verification: "deterministic",
      advice: "Strong entries explain results, scale, or outcomes instead of only listing responsibilities. Check that yours do.",
      check: (c) => {
        if (c.profile.experience.length === 0) return notRead("Experience");
        // Entries with real text to judge; no single entry needs a number.
        const described = c.profile.experience.filter((entry) => (entry.description ?? "").trim().length >= 40);
        if (described.length === 0) return { status: "unverifiable", explanation: "" };
        const found = metricsIn(described.map((entry) => entry.description ?? ""));
        if (found.length > 0) return { status: "pass", explanation: `Your roles mention ${quoteList(found)}.`, evidenceIds: idsOf(c, "experience") };
        const outcomes = described.filter((entry) => hasOutcomeLanguage(entry.description)).length;
        return outcomes > 0
          ? { status: "pass", explanation: `${plural(outcomes, "role")} explain what the work led to, not only the duties.`, evidenceIds: idsOf(c, "experience") }
          : { status: "improve", explanation: "Your role descriptions list duties but not what they led to: who used the work, what changed, or the result.", evidenceIds: idsOf(c, "experience") };
      },
    },
    semantic("experience-responsibilities", "Responsibilities are specific", "Descriptions say what the person was responsible for, specifically."),
    semantic("experience-accomplishments", "Accomplishments are included", "Descriptions say what was built, who used it, what changed, or what result happened, not only duties like \"helped students\" or \"worked on a project\". A clear result without a number counts."),
    semantic("experience-ownership", "Your contribution is clear", "Makes clear what the person did or owned, not only what the team did."),
    semantic("experience-technical", "Tools and technologies are specific", "Names the tools, technologies, or methods used, where relevant to the role."),
    semantic("experience-not-generic", "Avoids generic job-description wording", "Avoids generic duties that could appear in any job posting."),
    userCheck("experience-media", "Attached media", "Check that any media attached to your roles is current and worth opening."),
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
    semantic("projects-audience", "Says who it is for or what problem it solves", "Says who the project was built for or what problem it solved."),
    semantic("projects-technologies", "Technologies are identifiable where useful", "Names the languages, frameworks, or tools used where that helps explain the project. A list of tools does not replace saying what was built."),
    semantic("projects-result", "Result or impact is stated where possible", "States who used it, what it achieved, or what came of it, with a number where one exists."),
    semantic("projects-direction", "Strongest projects support your direction", "The most prominent projects relate to the person's direction."),
    userCheck("projects-links", "Links, demo, or repository", "Check that your projects link to a demo, repository, or write-up where you have one."),
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
    userCheck("certifications-credential", "Credential ID or URL where relevant", "Check that credentials show an ID or link where the issuer provides one. It isn't required."),
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
    userCheck("location-target", "Fits where you want opportunities", "Check that this location matches where you want to study, work, or find opportunities."),
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
    userCheck("otw-roles", "Job titles and locations", "Check that your Open to Work preferences include the roles and locations you actually want."),
    userCheck("otw-recruiters", "Recruiter-only Open to Work", "Check that your recruiter-only preferences are set the way you want."),
  ],
  network: [
    {
      id: "network-size",
      label: "Established LinkedIn network",
      verification: "deterministic",
      advice: "Connect with people you know and trust.",
      check: (c) => evaluateNetwork(c.shell?.connections, c.shell?.followers),
    },
    userCheck("network-relevant", "Connections in your field", "Check that a meaningful part of your network includes people in your field or industries you want to enter."),
  ],
};

export function semanticCriteria(section: OptimizerSection): CriterionDefinition[] {
  return CHECKLISTS[section].filter((criterion) => criterion.verification === "semantic");
}

/** Criteria only the user can check: what an image looks like, for example. */
export function userCriteria(section: OptimizerSection): CriterionDefinition[] {
  return CHECKLISTS[section].filter((criterion) => criterion.verification === "user");
}

// The reason given when a section has no text for AI to read.
export const NO_SECTION_TEXT = "no_section_text";

// LinkWise answers what it can (locally or with AI), asks the user about the rest, and any answer
// the user gives takes precedence over the automatic one, which stays alongside for reference.
export function evaluateChecklist(section: OptimizerSection, context: ChecklistContext, semanticState: SemanticState): EvaluatedCriterion[] {
  return CHECKLISTS[section].map((criterion): EvaluatedCriterion => {
    const base = { id: criterion.id, label: criterion.label, verification: criterion.verification, evidenceIds: [] as string[] };
    const automatic = automaticResult(criterion, context, semanticState);
    const answer = context.answers?.[criterion.id];
    if (answer === true || answer === false) {
      return { ...base, status: answer ? "pass" : "improve", explanation: answer ? "Confirmed by you." : "You marked this as needing improvement.", userValue: answer, automatic: { status: automatic.status, explanation: automatic.explanation } };
    }
    // Anything LinkWise can't settle by itself becomes a question for the user, never a dead end.
    if (automatic.status === "unverifiable" || automatic.status === "needs_user") return { ...base, status: "needs_user", explanation: automatic.ask ?? criterion.advice, userValue: null };
    return { ...base, status: automatic.status, explanation: automatic.explanation, evidenceIds: automatic.evidenceIds ?? [] };
  });
}

function automaticResult(criterion: CriterionDefinition, context: ChecklistContext, semanticState: SemanticState): { status: CriterionStatus | "checking"; explanation: string; evidenceIds?: string[]; ask?: string } {
  if (criterion.verification === "deterministic") return criterion.check!(context);
  if (criterion.verification === "semantic") {
    if (semanticState.status === "ready") {
      const result = semanticState.results.find((r) => r.criterionId === criterion.id);
      return result ? { status: result.status, explanation: result.explanation, evidenceIds: result.evidenceIds } : { status: "unverifiable", explanation: "", ask: `Review this yourself. ${criterion.advice}` };
    }
    if (semanticState.status === "unavailable") {
      // A partly read list says how much was read, then asks the user to judge the full one.
      const ask = semanticState.reason.startsWith("LinkWise read") ? `${semanticState.reason} Check this against your full list.` : `Review this yourself. ${criterion.advice}`;
      return { status: "unverifiable", explanation: "", ask };
    }
    return { status: "checking", explanation: "Checking…" };
  }
  return { status: "needs_user", explanation: criterion.advice };
}

export type ChecklistState = "strong" | "improve" | "missing";

export interface ChecklistSummary {
  state: ChecklistState | null;
  passed: number;
  verifiable: number;
  checking: boolean;
  /** Checks waiting for the user's answer. They stay out of the state, so an unanswered check never
   * lowers a section, while an answer counts like any other result. */
  needsUser: number;
}

// The section's status, from its checklist alone. Criteria LinkWise can't verify never count.
export function summarizeChecklist(present: boolean, criteria: EvaluatedCriterion[]): ChecklistSummary {
  const passed = criteria.filter((c) => c.status === "pass").length;
  const verifiable = passed + criteria.filter((c) => c.status === "improve").length;
  const checking = criteria.some((c) => c.status === "checking");
  const needsUser = criteria.filter((c) => c.status === "needs_user").length;
  if (!present) return { state: "missing", passed, verifiable, checking: false, needsUser: 0 };
  const state: ChecklistState | null = passed < verifiable ? "improve" : checking ? null : verifiable > 0 ? "strong" : null;
  return { state, passed, verifiable, checking, needsUser };
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
