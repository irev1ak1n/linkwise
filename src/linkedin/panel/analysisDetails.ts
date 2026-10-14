// Read-only views over an analysis that already exists: nothing here scores or asks AI anything.
import type { CriterionImportance, Goal } from "../../models/goal";
import type { LinkedInProfile } from "../../models/profile";
import type { EvidenceStrength } from "../../models/evidence";
import type { MatchResult } from "../../matching/scoreProfile";
import type { AiNarrativeDTO } from "../../ai/apiTypes";
import { buildEvidencePayload } from "../../ai/evidencePayload";

// Cuts text to its first few sentences, for the dashboard's short summary.
export function firstSentences(text: string, count: number): string {
  const sentences = text.trim().match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [text];
  return sentences.slice(0, count).join("").trim();
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
