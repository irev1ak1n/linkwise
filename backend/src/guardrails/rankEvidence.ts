// Ranks a profile's evidence by how well it proves something, so the About is built from the strongest
// few pieces and does not spend its space on weaker facts such as a list of languages or tools. The
// order is a default, not a rule: languages rank high when the person's direction is about them.

export interface RankableEvidence {
  id: string;
  section: string;
  text: string;
}

export interface RankedEvidence extends RankableEvidence {
  kind: string;
  rank: number;
}

const MEASURABLE = /\d[\d,.]*\+?\s*(%|k\b|m\b|users?|students?|people|peers?|customers?|clients?|members?|hours?|tickets?|sales|downloads?|visitors?|views?|followers?|teams?|projects?|placements?|\$|dollars?)|[$€£]\s?\d/i;
const BUILT = /\b(built|developed|created|designed|launched|programmed|coded|published)\b[^.]{0,80}\b(website|site|app|application|platform|tool|game|product|dashboard|system|software|bot|portal|store|library|api)\b/i;
const LEADERSHIP = /\b(captain|president|founder|co-?founder|chair|director|led|lead|leader|managed|organized|head of|officer)\b/i;
const TEACHING = /\b(tutor\w*|taught|teach\w*|mentor\w*|instructor|coach\w*)\b/i;
const TRAINING = /\b\d+\+?\s+years?\b|\b(training|bootcamp|diploma|program)\b/i;
const AWARD = /\b(award|winner|won|champion|finalist|place[ds]?|ranked|scholar|honou?rs?)\b/i;
const LANGUAGE_FOCUS = /\b(translat\w+|interpret\w+|bilingual|multilingual|linguist\w*|language (?:learning|teaching|instruction|services))\b/i;

export const MAX_RANKED = 7;

function classify(item: RankableEvidence, languagesMatter: boolean): { kind: string; rank: number } {
  const text = item.text;
  const candidates: { kind: string; rank: number }[] = [{ kind: "background", rank: 10 }];
  if (item.section === "languages") candidates.push({ kind: "language", rank: languagesMatter ? 70 : 15 });
  if (item.section === "skills") candidates.push({ kind: "skills", rank: 30 });
  if (item.section === "experience" || item.section === "volunteering") candidates.push({ kind: "experience", rank: 60 });
  if (item.section === "projects" || BUILT.test(text)) candidates.push({ kind: "project built", rank: 85 });
  if (LEADERSHIP.test(text) && item.section !== "skills") candidates.push({ kind: "leadership", rank: 75 });
  if (item.section === "honors" || (AWARD.test(text) && item.section !== "skills")) candidates.push({ kind: "award", rank: 55 });
  if (item.section === "certifications" || (TRAINING.test(text) && item.section !== "skills")) candidates.push({ kind: "credential or training", rank: 45 });
  if (TEACHING.test(text)) candidates.push({ kind: "teaching", rank: 40 });
  if (MEASURABLE.test(text) && item.section !== "skills" && item.section !== "languages") candidates.push({ kind: "measurable impact", rank: 100 });
  return candidates.reduce((best, next) => (next.rank > best.rank ? next : best));
}

// The current About, headline, and location are what is being rewritten or are plain facts, so they are not ranked.
export function rankEvidence(evidence: RankableEvidence[]): RankedEvidence[] {
  const languagesMatter = evidence.some((item) => (item.section === "headline" || item.section === "about" || item.section === "experience") && LANGUAGE_FOCUS.test(item.text));
  return evidence
    .filter((item) => !["about", "headline", "location"].includes(item.section))
    .map((item) => ({ ...item, ...classify(item, languagesMatter) }))
    .sort((a, b) => b.rank - a.rank);
}

// Roughly the best four to seven. Weak facts (tools, languages, background) only fill in when fewer than four better pieces exist.
export function strongestEvidence(evidence: RankableEvidence[]): RankedEvidence[] {
  const ranked = rankEvidence(evidence);
  const strong = ranked.filter((item) => item.rank > 30);
  return ranked.slice(0, Math.min(MAX_RANKED, Math.max(4, strong.length)));
}
