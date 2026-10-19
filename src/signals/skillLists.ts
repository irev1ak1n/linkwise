// Category coverage for Skills & Tools. Smart highlighting picks what matters for skimming; this
// makes sure that a sentence whose purpose is to list skills ("I acquired skills in Python, C++,
// .NET, ... and database management") shows every skill it confidently names, never only the first
// few. It is deterministic and local: recognized terms, the person's own listed skills, and the
// skills the semantic analysis already classified. Single skills in ordinary prose stay with the
// claims Smart highlighting chose (see skillTerms.skillsIn).
import { KNOWN_TOOLS } from "./skillTerms";

export interface SkillGroup {
  evidenceId: string;
  section: string;
  /** The exact contiguous source text of the group, e.g. ".NET, WPF, ASP.NET Core, SQL". */
  text: string;
  /** Where the group starts in its item's text. */
  start: number;
  items: string[];
  kind: "tool" | "concept";
}

export interface SkillListItem {
  id: string;
  section: string;
  text: string;
}

// Sentences that announce a list of skills. Context is what lets an unfamiliar name ("Laravel")
// count: after "skills in", a capitalized product name is a skill, in plain prose it may not be.
const LIST_CUE =
  /\b(?:skills?\s+(?:in|include|including|such as|like)|skills:|proficient\s+(?:in|with)|proficiency\s+in|experienced\s+(?:in|with)|experience\s+(?:in|with)|familiar(?:ity)?\s+with|knowledge\s+of|worked\s+(?:across|with)|technologies(?:\s+used)?:?|tools?(?:\s+used)?:|tech\s+stack:?|stack:|languages:|studied|learned|acquired|explored(?:\s+[\w\s]+?)?\s+through|using|built\s+with|including)\s+/gi;

const SKILL_CUE = /skill|proficien|experience|familiar|knowledge|technolog|tools?|stack|languages|studied|learned|acquired/i;

// Skill concepts: a qualifying modifier and a discipline ("web development", "3D modeling"), or a
// discipline that is a skill by itself ("robotics"). A bare "development" or "management" is not.
const MODIFIER =
  "web|software|game|database|data|video|audio|3d|2d|ui|ux|ui/ux|mobile|front-end|frontend|back-end|backend|full-stack|full stack|machine|graphic|object-oriented|embedded|cloud|network|product|digital|motion|app|application|systems?|computer|deep|statistical|financial|social media|content|photo|sound|circuit|pcb|cad|devops";
const DISCIPLINE = "development|programming|design|modeling|modelling|production|management|engineering|analysis|analytics|editing|animation|automation|testing|security|networking|learning|marketing|vision|science|architecture|administration";
const CONCEPT = new RegExp(`^(?:${MODIFIER})(?:\\s+(?:and|&)\\s+(?:${MODIFIER}))?\\s+(?:${DISCIPLINE})(?:\\s+(?:fundamentals|principles|basics|concepts))?(?:\\s+(?:in|with|using)\\s+\\S.*)?$`, "i");
const STANDALONE = /^(?:robotics|programming|coding|cybersecurity|photography|videography|animation|3d modeling|3d printing|graphic design|web design|ui\/ux|ux design|ui design|cad|machine learning|data science|artificial intelligence|ai|devops)$/i;
// A product or technology name: ".NET", "ASP.NET Core", "WPF", "Laravel", "Node.js", "C++".
const PRODUCT = /^(?:\.?[A-Z][\w.+#-]*|[A-Z]{2,}[\w.+#-]*|\.[A-Z][\w.+#-]*)(?:\s+(?:[A-Z][\w.+#-]*|\d[\w.]*)){0,2}$/;

const SEPARATOR = /\s*,\s*(?:and\s+|or\s+|&\s+)?|\s+(?:and|or|&)\s+|\s*\/\s*/g;
// A period ends a sentence only before a space or the end: ".NET" and "Node.js" stay whole.
const SENTENCE = /(?:[^.!?\n•]|[.!?](?!\s|$))+(?:[.!?](?=\s|$)|\n|•|$)/g;
const TRAILING_STOP = /\s+(?:through|for|over|during|while|via|to|at|from|since|by|as|which|that|because|across)\s.*$/i;

function normalizeTerm(term: string): string {
  return term.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase();
}

// The longest prefix of the item that is a skill: a list's last item often runs on into the rest
// of the sentence ("software development fundamentals through 2+ years of private instruction").
function skillPrefix(item: string, known: ReadonlySet<string>, inList: boolean): { text: string; kind: SkillGroup["kind"] } | null {
  let candidate = item.trim().replace(/[.;:]+$/, "").replace(TRAILING_STOP, "");
  // Then word by word from the end ("Quillon every week" is "Quillon").
  for (let i = 0; i < 4 && candidate; i++) {
    const kind = classify(candidate, known, inList);
    if (kind) return { text: candidate, kind };
    const cut = candidate.replace(/\s+\S+$/, "");
    if (cut === candidate) break;
    candidate = cut;
  }
  return null;
}

// A list's first item often carries the words before it ("tutoring in Python" in "tutoring in
// Python and C++"): what follows its last preposition may be the skill.
function skillSuffix(item: string, known: ReadonlySet<string>, inList: boolean): { text: string; offset: number; kind: SkillGroup["kind"] } | null {
  const m = [...item.matchAll(/\b(?:in|with|using|of|including)\s+/gi)].at(-1);
  if (!m) return null;
  const offset = m.index! + m[0].length;
  const skill = skillPrefix(item.slice(offset), known, inList);
  return skill ? { ...skill, offset } : null;
}

function classify(term: string, known: ReadonlySet<string>, inList: boolean): SkillGroup["kind"] | null {
  const words = term.split(/\s+/).length;
  if (words > 6) return null;
  // A discipline stays a concept even when listed as a skill, so it groups apart from the tools.
  if (CONCEPT.test(term) || STANDALONE.test(term)) return "concept";
  if (known.has(normalizeTerm(term))) return "tool";
  // Only inside an announced list: an unfamiliar product name, never a common word.
  if (inList && words <= 3 && PRODUCT.test(term) && !/^(?:I|The|A|An|My|Our|This|That|These|Over|In|At)$/.test(term.split(/\s+/)[0]!)) return "tool";
  return null;
}

interface Found {
  text: string;
  start: number;
  kind: SkillGroup["kind"];
}

// Splits the list part of a sentence into items with their positions in the item text.
function listItems(text: string, from: number, to: number): { text: string; start: number }[] {
  const items: { text: string; start: number }[] = [];
  const part = text.slice(from, to);
  let at = 0;
  for (const m of part.matchAll(SEPARATOR)) {
    items.push({ text: part.slice(at, m.index), start: from + at });
    at = m.index! + m[0].length;
  }
  items.push({ text: part.slice(at), start: from + at });
  return items.filter((i) => i.text.trim().length > 0).map((i) => {
    const lead = i.text.length - i.text.trimStart().length;
    return { text: i.text.trim(), start: i.start + lead };
  });
}

// Runs of recognized items, cut where the list stops or the kind of skill changes, so a long
// sentence reads as a few clean groups instead of one block or a row of separate marks.
function groupsIn(text: string, found: Found[]): Omit<SkillGroup, "evidenceId" | "section">[] {
  const groups: Omit<SkillGroup, "evidenceId" | "section">[] = [];
  for (const f of found) {
    const last = groups.at(-1);
    const gap = last ? text.slice(last.start + last.text.length, f.start) : "";
    if (last && last.kind === f.kind && /^\s*(?:,|\/|&|and|or|,\s*(?:and|or))\s*$/i.test(gap)) {
      last.text = text.slice(last.start, f.start + f.text.length);
      last.items.push(f.text);
    } else {
      groups.push({ text: f.text, start: f.start, items: [f.text], kind: f.kind });
    }
  }
  return groups;
}

/** Skill groups in every list-like sentence of the given items. A sentence counts when it
 * announces a list ("skills in ...") or when two or more recognized skills sit side by side. */
export function skillGroups(items: SkillListItem[], extraTerms: string[] = []): SkillGroup[] {
  const known = new Set([...KNOWN_TOOLS, ...extraTerms].map(normalizeTerm).filter((t) => t.length > 0 && t.length <= 40));
  const groups: SkillGroup[] = [];
  for (const item of items) {
    for (const sentence of item.text.matchAll(SENTENCE)) {
      const from = sentence.index!;
      const to = from + sentence[0].replace(/[.!?\n•]$/, "").length;
      const cues = [...item.text.slice(from, to).matchAll(LIST_CUE)];
      // The list starts after the last cue that is followed by a separated list.
      const cue = cues.reverse().find((c) => /,|\band\b/.test(item.text.slice(from + c.index! + c[0].length, to)));
      const listFrom = cue ? from + cue.index! + cue[0].length : from;
      // Only a cue that announces skills lets an unfamiliar product name count ("Laravel"); after a
      // generic one ("including", "using") a capitalized name may be a school or a club.
      const announced = !!cue && SKILL_CUE.test(cue[0]);
      const found: Found[] = [];
      for (const raw of listItems(item.text, listFrom, to)) {
        const skill = skillPrefix(raw.text, known, announced);
        if (skill) {
          found.push({ text: skill.text, start: raw.start, kind: skill.kind });
          continue;
        }
        const tail = skillSuffix(raw.text, known, announced);
        if (tail) found.push({ text: tail.text, start: raw.start + tail.offset, kind: tail.kind });
      }
      // Without a cue, only a run of two or more recognized skills is a list ("in Python and C++").
      const runs = groupsIn(item.text, found).filter((g) => cue || g.items.length >= 2);
      for (const g of runs) groups.push({ ...g, evidenceId: item.id, section: item.section });
    }
  }
  return groups;
}
