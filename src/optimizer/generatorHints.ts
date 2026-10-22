// The greyed example in each generator's "What should we include?" box, drawn from the person's own
// collected evidence: their strongest, shortest-to-say things, never a fixed example. It is only a
// placeholder; nothing here is ever submitted.
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import { extractMetrics } from "../savedProfiles/textCompare";

type Evidence = OptimizeProfileRequestBody["profile"]["evidence"][number];
export type HintKind = "headline" | "about";

export const FALLBACK_HINT = "projects, achievements, leadership, measurable results";

const LEADERSHIP = /\b(captain|co-?captain|president|vice[- ]president|founder|co-?founder|chair|director|head of|lead|leader|manager|officer|editor[- ]in[- ]chief|organizer)\b/i;
const DATE = /\b(19|20)\d{2}\b|\bpresent\b|\b\d+\s*(yrs?|mos?|years?|months?)\b/i;
const SCHOOL = /\b(school|university|college|academy|institute)\b/i;
const MAX_LENGTH = 32;
const MAX_HINTS = 4;

const parts = (item: Evidence) => item.text.split(" — ").map((part) => part.replace(/\s*·.*$/, "").trim()).filter(Boolean);
const short = (text: string) => text.length > 0 && text.length <= MAX_LENGTH;
const lower = (text: string) => text.toLowerCase();
const entries = (evidence: Evidence[], ...sections: string[]) => evidence.filter((item) => sections.includes(item.section));

// "Webmaster Team Captain — TSA" gives "TSA leadership"; with no organization, the role itself.
function leadership(evidence: Evidence[]): string[] {
  return entries(evidence, "experience", "organizations", "volunteering", "honors").flatMap((item) => {
    const [title, second] = parts(item);
    if (!title || !LEADERSHIP.test(title)) return [];
    // A school is where someone is, not what they led, so the role itself is the better hint.
    const organization = second && short(second) && !DATE.test(second) && second.split(/\s+/).length <= 3 && !SCHOOL.test(second) ? second : null;
    return [organization ? `${organization} leadership` : lower(title)];
  });
}

// A number that measures something, with the kind of work it belongs to when the wording doesn't say.
function measurable(evidence: Evidence[]): string[] {
  return entries(evidence, "experience", "projects", "volunteering", "about").flatMap((item) => {
    const title = parts(item)[0] ?? "";
    const topic = /tutor/i.test(title) ? "tutoring" : /teach|instructor/i.test(title) ? "teaching" : /volunteer/i.test(title) ? "volunteer" : "";
    return extractMetrics(item.text)
      .filter((metric) => metric.unit && metric.unit !== "skill")
      .map((metric) => ({ value: metric.value, text: topic && /^[\d.,]+\+?\s*(hours?|hrs?|sessions?|lessons?)$/i.test(metric.text) ? metric.text.replace(/\s+/, ` ${topic} `) : metric.text }));
  })
    // The biggest numbers say the most.
    .sort((a, b) => b.value - a.value)
    .map((metric) => metric.text)
    .filter(short);
}

function projects(evidence: Evidence[]): string[] {
  const named = entries(evidence, "projects").map((item) => parts(item)[0] ?? "");
  // With no Projects section, what someone built shows in the titles of their roles.
  const built = entries(evidence, "experience")
    .map((item) => parts(item)[0] ?? "")
    .filter((title) => /\b(developer|engineer|designer|builder|creator|programmer|webmaster)\b/i.test(title) && !LEADERSHIP.test(title))
    .map((title) => lower(title));
  return [...named, ...built].filter(short);
}

function awards(evidence: Evidence[]): string[] {
  return [...entries(evidence, "honors"), ...entries(evidence, "certifications")].map((item) => parts(item)[0] ?? "").filter(short);
}

function years(evidence: Evidence[]): string[] {
  return entries(evidence, "about", "education", "experience").flatMap((item) => {
    const match = /\b(\d{1,2})\+?\s+years?\s+(?:of\s+)?(?:(?:hands-on\s+)?(training|study|studying|experience))/i.exec(item.text);
    if (!match) return [];
    const noun = /study/i.test(match[2]!) ? "study" : match[2]!.toLowerCase();
    return [`${match[1]} years of ${noun}`];
  });
}

function skills(evidence: Evidence[]): string[] {
  const list = entries(evidence, "skills")[0]?.text.split(",").map((skill) => skill.trim()) ?? [];
  return list.filter(short).slice(0, 3);
}

// What each tool leads with: the headline stresses positioning and proof, the About stresses what was done.
const PRIORITY: Record<HintKind, ((evidence: Evidence[]) => string[])[]> = {
  headline: [years, leadership, awards, measurable, projects],
  about: [projects, leadership, measurable, awards, years],
};

export function includeHint(evidence: Evidence[], kind: HintKind): string {
  const pools = PRIORITY[kind].map((pick) => pick(evidence));
  const chosen: string[] = [];
  const seen = new Set<string>();
  // One from each kind in priority order, then second helpings, so the hint stays varied.
  for (let round = 0; round < 2 && chosen.length < MAX_HINTS; round++) {
    for (const pool of pools) {
      const phrase = pool[round];
      if (!phrase || chosen.length >= MAX_HINTS || seen.has(phrase.toLowerCase())) continue;
      seen.add(phrase.toLowerCase());
      chosen.push(phrase);
    }
  }
  // Tool names only stand in when nothing stronger exists.
  if (chosen.length < 2) chosen.push(...skills(evidence).filter((skill) => !seen.has(skill.toLowerCase())).slice(0, MAX_HINTS - chosen.length));
  return chosen.length >= 2 ? chosen.join(", ") : FALLBACK_HINT;
}
