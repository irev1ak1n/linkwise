// Read-only views over an analysis that already exists: nothing here scores or asks AI anything.
import type { CriterionImportance, Goal } from "../../models/goal";
import { profileTextFields, type LinkedInProfile } from "../../models/profile";
import type { EvidenceStrength } from "../../models/evidence";
import type { MatchResult } from "../../matching/scoreProfile";
import type { AiNarrativeDTO } from "../../ai/apiTypes";
import { buildEvidencePayload } from "../../ai/evidencePayload";

// A sentence ends at ".", "!" or "?" followed by a space, so a dot inside a word (".NET", "Node.js",
// "e.g.") never ends one and no text is ever dropped. Text with no ending is one sentence.
export function splitSentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

// Cuts text to its first few sentences, for the dashboard's short summary.
export function firstSentences(text: string, count: number): string {
  return splitSentences(text).slice(0, count).join(" ").trim();
}

const ASSESSMENT_LABEL: Record<EvidenceStrength, string> = {
  strong: "Strong match",
  moderate: "Partial match",
  weak: "Weak evidence",
  missing: "Not found",
  unknown: "Not checked yet",
};

const IMPORTANCE_LABEL: Record<CriterionImportance, string> = { MUST_HAVE: "Must have", PREFERRED: "Preferred", OPTIONAL: "Optional", EXCLUDED: "Exclude" };

const EXCLUDED_LABEL: Partial<Record<EvidenceStrength, string>> = { strong: "Excluded trait found", moderate: "Possibly present" };

// Engine bookkeeping that explains nothing to the reader.
const GENERIC_EXPLANATIONS = new Set(["Assessed by LinkWise's local deterministic matcher."]);
// The local matcher's own wrapper around a quoted snippet: it names the evidence, not why it counts.
const SNIPPET_WRAPPER = /^(direct|closely related|only loosely related) (\w+ )?evidence found:/i;
const MIN_EXPLANATION_WORDS = 7;
const MAX_DETAIL_WORDS = 45;

export interface CriterionRow {
  id: string;
  label: string;
  importance: string;
  strength: EvidenceStrength;
  assessment: string;
  evidence?: string;
  note?: string;
}

// One row per goal criterion, straight from the result that produced the Match %.
export function criteriaBreakdown(goal: Goal, result: MatchResult): CriterionRow[] {
  return goal.criteria.map((criterion) => {
    const reason = result.reasons.find((r) => r.criterion.id === criterion.id);
    const missing = result.missing.find((m) => m.criterion.id === criterion.id);
    const strength: EvidenceStrength = reason?.strength ?? missing?.strength ?? "unknown";
    const note = reason?.explanation ?? missing?.note;
    return {
      id: criterion.id,
      label: criterion.label,
      importance: IMPORTANCE_LABEL[criterion.importance],
      strength,
      assessment: (criterion.importance === "EXCLUDED" ? EXCLUDED_LABEL[strength] : undefined) ?? ASSESSMENT_LABEL[strength],
      evidence: reason?.evidence?.snippet,
      note: note && !GENERIC_EXPLANATIONS.has(note) ? note : undefined,
    };
  });
}

const IMPORTANCE_RANK: Record<CriterionImportance, number> = { MUST_HAVE: 0, PREFERRED: 1, OPTIONAL: 2, EXCLUDED: 3 };

export interface ConfirmedCriterion {
  id: string;
  label: string;
  detail?: string;
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// Whether an explanation actually says why a criterion is met, rather than naming one skill or
// keyword, or being the engine's own bookkeeping.
function isRealExplanation(text: string | undefined): text is string {
  const clean = text?.trim();
  return !!clean && !GENERIC_EXPLANATIONS.has(clean) && !SNIPPET_WRAPPER.test(clean) && wordCount(clean) >= MIN_EXPLANATION_WORDS;
}

// Words a criterion or its evidence is about, trimmed to a stem so "development" finds "developer".
const GENERIC_WORDS = new Set(["skills", "skill", "experience", "experienced", "strong", "ability", "abilities", "knowledge", "background", "member", "with", "and", "the", "for", "using", "work", "working"]);
const stems = (text: string) => [...new Set((text.toLowerCase().match(/[\p{L}\d+#.]{4,}/gu) ?? []).filter((w) => !GENERIC_WORDS.has(w)).map((w) => w.slice(0, 5)))];

// What a person has done comes first: projects built, then work, then training, then teaching,
// leadership and awards. Skills and tools are supporting evidence, so they come last.
const SECTION_ORDER = ["projects", "experience", "education", "volunteering", "organizations", "honors", "certifications", "about", "headline", "skills", "languages"];
// Skills only join the sentence when fewer than this many stronger pieces were found.
const SKILLS_ONLY_BELOW = 2;
// A measurable result in an entry's own description, such as "4,000+ student school" or "500+ people".
const METRIC = /\b\d[\d,.]*\+?\s+(?:[a-z-]+\s+){0,1}[a-z-]+/i;

const joinList = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const plain = (text: string) => text.replace(/[;\u2014\u2013]/g, ",").replace(/\s+/g, " ").trim();

/**
 * A grounded sentence for a criterion the engine matched but has no real explanation for: the few
 * strongest pieces of profile evidence that relate to it, as context (roles, projects, studies,
 * skills), never one raw keyword. Reads only the profile that was collected.
 */
export function supportSentence(label: string, profile: LinkedInProfile | undefined, snippet: string | undefined, section: string | undefined): string {
  const wanted = stems(`${label} ${snippet ?? ""}`);
  const fields = profile ? profileTextFields(profile) : [];
  const hits = fields
    .map((field) => ({ field, score: wanted.filter((stem) => field.text.toLowerCase().includes(stem)).length }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
  const phrases: { section: string; text: string }[] = [];
  for (const sectionName of SECTION_ORDER) {
    const hit = hits.find((h) => h.field.section === sectionName);
    if (!hit) continue;
    // Skills are support, not the answer: left out while stronger evidence already explains it.
    if (sectionName === "skills" && phrases.length >= SKILLS_ONLY_BELOW) continue;
    const name = plain(hit.field.label.split(": ").slice(1).join(": "));
    const result = hit.field.text.split(" — ").slice(1).join(" ").match(METRIC)?.[0];
    const withResult = (text: string) => (result ? `${text} (${plain(result)})` : text);
    const text =
      sectionName === "experience" ? withResult(name ? `work as ${name}` : "work experience")
      : sectionName === "projects" ? withResult(name ? `the ${name} project` : "project work")
      : sectionName === "education" ? (name ? `studies at ${name}` : "education")
      : sectionName === "certifications" ? (name ? `the ${name} certification` : "certifications")
      : sectionName === "about" ? "the About section"
      : sectionName === "headline" ? "the headline"
      : sectionName === "skills" ? `skills such as ${joinList((profile?.skills ?? []).filter((skill) => wanted.some((stem) => skill.toLowerCase().includes(stem))).slice(0, 3).map(plain)) || plain(snippet ?? "listed skills")}`
      : name ? `${sectionName} with ${name}` : sectionName;
    phrases.push({ section: sectionName, text });
    if (phrases.length === 4) break;
  }
  if (phrases.length > 0) return `The profile supports this through ${joinList(phrases.map((p) => p.text))}.`;
  const where = section ? ` in ${section}` : "";
  return snippet ? `The profile shows relevant evidence${where}, such as ${plain(snippet).slice(0, 120)}.` : `The profile shows relevant evidence${where}.`;
}

// Up to two whole sentences, within the length a reader takes in at a glance.
function conciseDetail(text: string): string {
  const kept: string[] = [];
  for (const sentence of splitSentences(text).slice(0, 2)) {
    if (kept.length > 0 && wordCount([...kept, sentence].join(" ")) > MAX_DETAIL_WORDS) break;
    kept.push(sentence);
  }
  return kept.join(" ");
}

// The "Looking for" criteria the result actually confirmed: strong evidence first, then by importance.
// Each gets a sentence on why it is met: its own explanation when it has a real one, otherwise a
// grounded one built from the profile.
export function confirmedCriteria(goal: Goal, result: MatchResult, limit = 4, profile?: LinkedInProfile): ConfirmedCriterion[] {
  return result.reasons
    .filter((reason) => reason.criterion.importance !== "EXCLUDED" && goal.criteria.some((c) => c.id === reason.criterion.id))
    .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "strong" ? -1 : 1) || IMPORTANCE_RANK[a.criterion.importance] - IMPORTANCE_RANK[b.criterion.importance])
    .slice(0, limit)
    .map((reason) => {
      const detail = isRealExplanation(reason.explanation)
        ? conciseDetail(reason.explanation)
        : supportSentence(reason.criterion.label, profile, reason.evidence?.snippet, reason.evidence?.sourceSection ?? (reason.evidence as { section?: string } | undefined)?.section);
      return { id: reason.criterion.id, label: reason.criterion.label, detail };
    });
}

export interface EvidenceItem {
  id: string;
  section: string;
  text: string;
  // The parts of a long text that relate to what it supported, quoted unchanged.
  excerpt: string;
}

const EXCERPT_THRESHOLD = 220;
const STOP_WORDS = new Set(["with", "that", "this", "from", "their", "they", "have", "were", "which", "about", "profile", "shows"]);

const words = (text: string) => new Set((text.toLowerCase().match(/[\p{L}\d+#]{4,}/gu) ?? []).filter((w) => !STOP_WORDS.has(w)));

export function focusExcerpt(text: string, hint: string): string {
  if (text.length <= EXCERPT_THRESHOLD) return text;
  const fragments = text.split(/(?<=[.!?])\s+|\s+[-•·—]\s*|-(?=[A-Z])|\n+/).map((f) => f.trim()).filter((f) => f.length > 0);
  const wanted = words(hint);
  const scored = fragments.map((fragment, index) => ({ fragment, index, score: [...words(fragment)].filter((w) => wanted.has(w)).length }));
  const best = scored.filter((f) => f.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).sort((a, b) => a.index - b.index);
  return best.length > 0 ? best.map((f) => f.fragment).join(" … ") : `${text.slice(0, EXCERPT_THRESHOLD).trimEnd()}…`;
}

export interface EvidenceGroup {
  title: string;
  items: EvidenceItem[];
}

// The profile text behind the analysis, grouped by what it supported. AI strengths cite profile
// items by id; without them, each matched criterion's own snippet is used. Only real profile
// text is ever shown.
export function evidenceGroups(profile: LinkedInProfile, result: MatchResult, narrative?: AiNarrativeDTO): EvidenceGroup[] {
  const payload = new Map(buildEvidencePayload(profile).map((item) => [item.id, item]));
  const cited = (narrative?.strengths ?? [])
    .map((strength) => ({
      title: strength.title,
      items: [...new Set(strength.evidenceIds)]
        .map((id) => payload.get(id))
        .filter((item): item is NonNullable<typeof item> => !!item)
        .map((item) => ({ id: item.id, section: item.section, text: item.text, excerpt: focusExcerpt(item.text, `${strength.title} ${strength.explanation}`) })),
    }))
    .filter((group) => group.items.length > 0);
  if (cited.length > 0) return cited;
  return result.reasons
    .filter((reason) => reason.evidence)
    .map((reason) => ({
      title: reason.criterion.label,
      items: [
        {
          id: reason.criterion.id,
          section: reason.evidence!.sourceSection,
          text: reason.evidence!.snippet,
          excerpt: focusExcerpt(reason.evidence!.snippet, `${reason.criterion.label} ${reason.explanation}`),
        },
      ],
    }));
}
