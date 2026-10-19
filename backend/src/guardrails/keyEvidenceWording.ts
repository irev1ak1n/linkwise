// Key Evidence lines are written by the model from one profile item, so they are checked like any
// untrusted output: each must stand alone, and none may say more than its item does. A line that
// fails is dropped (the claim simply has no Key Evidence line), never repaired into a guess.

export const MAX_EVIDENCE_WORDS = 32;
const MIN_EVIDENCE_WORDS = 3;

export type WordingProblem =
  | "too_short"
  | "too_long"
  | "first_person"
  | "empty_lead_in"
  | "unsupported_adjective"
  | "inflated_ownership"
  | "lost_qualifier"
  | "lost_plus"
  | "contextless";

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// Lead-ins that spend words on the reader instead of the evidence.
const EMPTY_LEAD_IN = /^(?:the (?:profile|candidate|person)|this (?:person|candidate|profile)|according to|he |she |they )/i;
const FIRST_PERSON = /\b(?:I|I'm|I've|I'd|my|me|mine|myself)\b/;

// Praise the text has to say itself before a line may repeat it.
const ADJECTIVES = ["prestigious", "elite", "exceptional", "impressive", "highly competitive", "remarkable", "outstanding", "renowned", "world-class", "extraordinary", "top-tier"];

// Verbs that claim ownership or a result. A line may only use one the item itself uses.
const STRONG_VERBS: [RegExp, RegExp][] = [
  [/\b(?:led|leads?|leading)\b/i, /\b(?:led|lead|leads|leading|leader|co-led)\b/i],
  [/\bmanag(?:ed|es|ing|e)\b/i, /\bmanag/i],
  [/\bfound(?:ed|er|ing)\b/i, /\bfound(?:ed|er|ing)\b/i],
  [/\bcreat(?:ed|es|ing|e)\b/i, /\bcreat/i],
  [/\b(?:built|builds?|building)\b/i, /\b(?:built|build|builds|building)\b/i],
  [/\bdevelop(?:ed|s|ing)?\b/i, /\bdevelop/i],
  [/\blaunch(?:ed|es|ing)?\b/i, /\blaunch/i],
  [/\b(?:sold|sells?|selling)\b/i, /\b(?:sold|sell|sells|selling)\b/i],
  [/\b(?:won|wins?|winning|winner)\b/i, /\b(?:won|win|wins|winning|winner|first|1st|2nd|3rd|place|award)/i],
  [/\borgani[sz](?:ed|es|ing|e)\b/i, /\borgani[sz]/i],
  [/\bdirect(?:ed|s|ing)?\b/i, /\bdirect/i],
  [/\bcaptain(?:ed|s|ing)?\b/i, /\bcaptain/i],
  [/\bowned\b/i, /\bown/i],
];

// A qualifier in the source must survive into the line, in its own words or an equivalent.
const QUALIFIERS: [RegExp, RegExp][] = [
  [/\bcontribut/i, /\bcontribut/i],
  [/\bco-(?:led|founded|organi[sz]ed|authored|created)\b/i, /\bco-/i],
  [/\bassist/i, /\bassist|\bhelp/i],
  [/\bhelped\b/i, /\bhelp|\bassist|\bsupport/i],
  [/~\s*\d|\bapproximately\b|\b(?:about|around)\s+\d/i, /~|\bapproximately\b|\b(?:about|around|roughly)\s+\d/i],
  [/\bup to\b/i, /\bup to\b/i],
  [/\bfinalist\b/i, /\bfinalist/i],
  [/\brunner-up\b/i, /\brunner-up/i],
];

// Openings that need their subject or object to make sense ("Awarded to 18 students annually").
const FRAGMENT_OPENING = /^(?:awarded to|selected from|covers?|covering|reached|ranked|presented to|teams? presented|guided|managed|serving|supporting)\b/i;

export function wordingProblems(text: string, claimQuote: string, itemText: string): WordingProblem[] {
  const problems: WordingProblem[] = [];
  const words = wordCount(text);
  if (words < MIN_EVIDENCE_WORDS) problems.push("too_short");
  if (words > MAX_EVIDENCE_WORDS) problems.push("too_long");
  if (FIRST_PERSON.test(text)) problems.push("first_person");
  if (EMPTY_LEAD_IN.test(text)) problems.push("empty_lead_in");
  const lowerItem = itemText.toLowerCase();
  if (ADJECTIVES.some((a) => text.toLowerCase().includes(a) && !lowerItem.includes(a))) problems.push("unsupported_adjective");
  if (STRONG_VERBS.some(([inLine, inItem]) => inLine.test(text) && !inItem.test(itemText))) problems.push("inflated_ownership");
  if (QUALIFIERS.some(([inQuote, inLine]) => inQuote.test(claimQuote) && !inLine.test(text))) problems.push("lost_qualifier");
  // "500+" stays "500+" (or "more than 500" / "over 500"), never a bare "500".
  for (const m of claimQuote.matchAll(/(\d[\d,.]*)\+/g)) {
    const n = m[1]!;
    if (text.includes(n) && !new RegExp(`${n.replace(/[.]/g, "\\.")}\\+|(?:more than|over|at least)\\s+${n.replace(/[.]/g, "\\.")}`, "i").test(text)) problems.push("lost_plus");
  }
  // A short line opening with a dangling verb or preposition, with no named entity to anchor it.
  if (FRAGMENT_OPENING.test(text) && words < 12 && !/\s\p{Lu}/u.test(text)) problems.push("contextless");
  return [...new Set(problems)];
}
