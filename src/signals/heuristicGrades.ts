// Fallback grading when the AI classifier is unavailable: the same graded shape the model returns,
// from simple patterns, so ranking and highlighting still work. Low confidence on purpose, so
// AI grades always take precedence once they exist.
import type { GradedCandidateDTO, Grades, SignalFactType, SignalSection } from "../ai/signalTypes";

const CONFIDENCE = 0.55;
// A clause may run long when that is what keeps a claim whole.
const MAX_WORDS = 25;
const MIN_WORDS = 3;

const COMPETITION = /\b(?:\d+(?:st|nd|rd|th)\s+place|first|second|third|winner|won|finalist|champion(?:ship)?|placed|award(?:ed)?|medal|honou?rable mention)\b/i;
const LEADERSHIP = /\b(?:led|lead|leading|captain(?:ed)?|managed|manag(?:e|ing)|founded|co-founded|organi[sz]ed|mentored|coordinated|president|head of|directed|supervised)\b/i;
const OWNERSHIP = /\b(?:built|developed|designed|created|launched|implemented|deployed|engineered|programmed|wrote|authored|produced)\b/i;
const IMPACT = /\b(?:reached|served|serving|increased|reduced|grew|raised|sold|saved|improved|used by|helped \d|supporting \d)\b/i;
const TEACHING = /\b(?:tutor(?:ed|ing)?|taught|teach(?:ing)?|instruct(?:ed|ing)?|mentor(?:ed|ing)?)\b/i;
const SELECTIVE = /\b(?:selected|admitted|accepted|chosen|invited|scholarship|fellowship)\b/i;
const SUSTAINED = /\b\d+\+?\s*(?:years?|yrs?)\s+(?:of|studying|training|experience)/i;
const SCALE = /\b\d[\d,.]*\+?\s*(?:%|k\b|people|persons|students|users|customers|clients|members|tickets|participants|attendees|visitors|hours|hrs|schools|volunteers|employees|children|kids|countries|downloads)/i;
const SELF = /\b(?:passionate|interested in|motivated|driven|aspiring|love|enjoy|eager|strive|dedicated to)\b/i;
const CREDENTIAL = /\b(?:graduated|diploma|degree|bachelor'?s?|master'?s?|certified|certification|licen[cs]e)\b/i;
const MILESTONE = /\b(?:at (?:the )?age (?:of )?\d{1,2}|began|started|first ever|youngest)\b/i;
const COURSES = /\b(?:AP |courses?|coursework|classes|curriculum)\b/;
const DATE_ONLY = /^(?:[A-Z][a-z]{2,8}\.?\s+)?\d{4}(?:\s*[-–]\s*(?:(?:[A-Z][a-z]{2,8}\.?\s+)?\d{4}|Present))?(?:\s*·.*)?$|^\d+\s*(?:yrs?|mos?)(?:\s+\d+\s*mos?)?$/;

function clauses(part: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const pattern = /[^.;!?\n•]+/g;
  for (const match of part.matchAll(pattern)) {
    let text = match[0];
    const lead = text.length - text.trimStart().length;
    text = text.trim();
    if (!text) continue;
    // Keep long clauses short by cutting at a comma, so the quote stays exact source text.
    const words = text.split(/\s+/);
    if (words.length > MAX_WORDS) {
      const cut = text.lastIndexOf(",", text.split(/\s+/).slice(0, MAX_WORDS).join(" ").length);
      text = cut > 15 ? text.slice(0, cut) : words.slice(0, MAX_WORDS).join(" ");
    }
    if (text.split(/\s+/).length >= MIN_WORDS) out.push({ text, start: match.index! + lead });
  }
  return out;
}

function grade(text: string, section: SignalSection): { type: SignalFactType; grades: Grades } {
  const g: Grades = { impact: 0, ownership: 0, result: 0, scale: 0, selectivity: 0, leadership: 0, technicalDepth: 0, sustainedDepth: 0, specificity: 1, distinctiveness: 0, genericness: 0 };
  const types: SignalFactType[] = [];
  const raise = (key: keyof Grades, value: number) => (g[key] = Math.max(g[key], value));
  if (COMPETITION.test(text)) {
    raise("selectivity", 3), raise("result", 2), raise("distinctiveness", 2), raise("specificity", 2);
    types.push("competition_result");
  }
  if (LEADERSHIP.test(text)) {
    raise("leadership", 3), raise("ownership", 2), raise("distinctiveness", 2);
    types.push("leadership_scope");
  }
  if (OWNERSHIP.test(text)) {
    raise("ownership", 3), raise("technicalDepth", 1), raise("distinctiveness", 1);
    types.push("project_ownership");
  }
  if (IMPACT.test(text)) {
    raise("impact", 2), raise("result", 2);
    types.push("measurable_impact");
  }
  if (TEACHING.test(text)) {
    raise("ownership", 2), raise("impact", 1);
    types.push("teaching_scope");
  }
  if (SELECTIVE.test(text)) {
    raise("selectivity", 2), raise("distinctiveness", 2);
    types.push("selective_admission");
  }
  if (SUSTAINED.test(text)) {
    raise("sustainedDepth", 3), raise("distinctiveness", 2);
    types.push("sustained_training");
  }
  if (CREDENTIAL.test(text)) {
    raise("result", 2), raise("distinctiveness", 2), raise("specificity", 2);
    types.push("credential");
  }
  if (MILESTONE.test(text)) {
    raise("distinctiveness", 2), raise("specificity", 2);
    types.push("milestone");
  }
  if (SCALE.test(text)) raise("scale", 2), raise("specificity", 3);
  if (types.length === 0 && SELF.test(text)) {
    raise("genericness", 2);
    types.push("self_description");
  }
  if (types.length === 0 && COURSES.test(text)) types.push("coursework");
  let type = types[0] ?? "other";
  if (section === "languages") type = "language";
  return { type, grades: g };
}


// The description parts of an entry: never its title or organization (the first two parts).
function descriptiveParts(text: string, section: SignalSection): { text: string; start: number }[] {
  const parts: { text: string; start: number }[] = [];
  let start = 0;
  text.split(" — ").forEach((part, index) => {
    // The title always leads; the next part is the organization unless it reads like a sentence.
    const words = part.trim().split(/\s+/).length;
    const skip = section !== "about" && text.includes(" — ") && (index === 0 || (index === 1 && words < 5));
    if (!skip && !DATE_ONLY.test(part.trim())) parts.push({ text: part, start });
    start += part.length + 3;
  });
  return parts;
}

const ACTION_START = /^(?:\p{Lu}\p{Ll}+ed|Built|Won|Led|Taught|Ran|Made|Wrote|Grew|Began|Sold|Took|Gave|Spent|Became|Brought|Drove)\b/u;

// Key Evidence wording without AI: only a clause that already reads as a complete action ("I built
// a dashboard for 40 teachers" becomes "Built a dashboard for 40 teachers"). Anything else gets no
// line rather than a broken one.
export function fallbackEvidence(clause: string): string | null {
  const text = clause.replace(/^I(?:'ve| have| had| was)?\s+/, "").replace(/[.;,]+$/, "").trim();
  const line = text.charAt(0).toUpperCase() + text.slice(1);
  const words = line.split(/\s+/).length;
  if (words < 6 || words > 28 || !ACTION_START.test(line) || /\b(?:I|my|me|I'm)\b/.test(line)) return null;
  return line;
}

export function heuristicGrades(item: { id: string; section: SignalSection; text: string }): GradedCandidateDTO[] {
  if (item.section === "headline" || item.section === "location" || item.section === "skills") return [];
  const candidates: GradedCandidateDTO[] = [];
  for (const part of descriptiveParts(item.text, item.section)) {
    for (const clause of clauses(part.text)) {
      const { type, grades } = grade(clause.text, item.section);
      if (type === "other" && Object.values(grades).every((v) => v <= 1)) continue;
      candidates.push({
        evidenceId: item.id,
        section: item.section,
        quote: clause.text,
        fact: fallbackEvidence(clause.text),
        type,
        grades,
        goalRelevance: 0,
        confidence: CONFIDENCE,
        metrics: (clause.text.match(SCALE) ?? []).map((m) => m.trim()),
      });
    }
  }
  return candidates;
}
