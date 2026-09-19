// The hybrid evidence matcher: exact phrase matching first, then a concept graph for domain
// and role-level reasoning (lets "Mechanical Engineering" satisfy "engineering background" but
// keeps "Robotics Club member" from satisfying "FRC mentor"), then a keyword tier as the final
// fallback for anything the concept graph doesn't recognize.
//
// No neural embedding model here, see scoreProfile.ts for why.
import type { Criterion } from "../models/goal";
import type { LinkedInProfile, ProfileSectionName } from "../models/profile";
import { profileTextFields } from "../models/profile";
import type { EvidenceItem, EvidenceStrength, ProfileEvidence } from "../models/evidence";
import {
  DOMAIN_CONCEPTS,
  LEADER_WORDS,
  PROFESSIONAL_WORDS,
  ROLE_LEVEL,
  detectDomains,
  matchesAny,
} from "../evidence/conceptGraph";
import { normalizeText, significantKeywords, stem, truncateSnippet } from "./textNormalize";

export interface SemanticEvidence {
  fieldLabel: string;
  snippet: string;
  sourceSection: ProfileSectionName | "headline" | "location";
}

export interface SemanticMatchResult {
  strength: EvidenceStrength;
  evidence?: SemanticEvidence;
  /** A related but inconclusive mention, never invented, only from real profile text. */
  partialEvidence?: SemanticEvidence;
  /** A short reason for the strength, always describes the evidence above. */
  explanation: string;
}

// Sections whose presence indicates a reasonably-read profile. Without any of these,
// an unmatched criterion is genuinely unknown rather than missing.
const CORE_SECTIONS: ProfileSectionName[] = ["about", "experience", "education"];

const MENTOR_TRIGGER_WORDS = ["mentor", "mentoring", "mentors", "mentorship"];
const LEADER_TRIGGER_WORDS = ["lead", "leader", "leadership", "led"];
const BACKGROUND_TRIGGER_WORDS = ["background", "experience", "exposure", "knowledge"];
const MULTILINGUAL_TRIGGER_WORDS = ["multilingual", "multiple languages", "bilingual", "several languages", "polyglot"];

interface CriterionConcept {
  domains: string[];
  requiredMarker: "mentor" | "leader" | null;
  requiredRoleLevel: number;
  isConceptual: boolean;
  isMultilingual: boolean;
}

function parseCriterionConcept(label: string): CriterionConcept {
  const lower = label.toLowerCase();
  const domains = detectDomains(label);

  if (matchesAny(lower, MULTILINGUAL_TRIGGER_WORDS)) {
    return { domains, requiredMarker: null, requiredRoleLevel: 0, isConceptual: true, isMultilingual: true };
  }

  let requiredMarker: "mentor" | "leader" | null = null;
  let requiredRoleLevel = 0;

  if (matchesAny(lower, MENTOR_TRIGGER_WORDS)) {
    requiredMarker = "mentor";
    requiredRoleLevel = ROLE_LEVEL.LEADER;
  } else if (matchesAny(lower, LEADER_TRIGGER_WORDS)) {
    requiredMarker = "leader";
    requiredRoleLevel = ROLE_LEVEL.LEADER;
  } else if (matchesAny(lower, PROFESSIONAL_WORDS)) {
    requiredRoleLevel = ROLE_LEVEL.PROFESSIONAL;
  } else if (matchesAny(lower, BACKGROUND_TRIGGER_WORDS)) {
    requiredRoleLevel = ROLE_LEVEL.LEARNER;
  }

  const isConceptual = domains.length > 0 || requiredMarker !== null || requiredRoleLevel > 0;
  return { domains, requiredMarker, requiredRoleLevel, isConceptual, isMultilingual: false };
}

function toSemanticEvidence(item: EvidenceItem, sectionLabel: string): SemanticEvidence {
  return { fieldLabel: sectionLabel, snippet: truncateSnippet(item.text), sourceSection: item.sourceSection };
}

// Looks up the display label a field normally carries, so a concept match reads the same way
// an exact match does ("Education: Duke University", not just "education").
function sectionLabelFor(profile: LinkedInProfile, item: EvidenceItem): string {
  const field = profileTextFields(profile).find((f) => f.section === item.sourceSection && f.text === item.text);
  return field?.label ?? item.sourceSection;
}

function hasAnyCoreSectionContent(evidence: ProfileEvidence): boolean {
  return CORE_SECTIONS.some((section) => evidence.sectionsWithContent.has(section));
}

function evaluateMultilingual(evidence: ProfileEvidence): SemanticMatchResult {
  const count = evidence.languages.length;
  if (count >= 2) {
    return {
      strength: "strong",
      evidence: { fieldLabel: "Languages", snippet: evidence.languages.map((l) => l.text).join(", "), sourceSection: "languages" },
      explanation: `${count} languages listed on the profile.`,
    };
  }
  if (count === 1) {
    return {
      strength: "weak",
      partialEvidence: toSemanticEvidence(evidence.languages[0], "Languages"),
      explanation: "Only one language listed — not confirmed multilingual.",
    };
  }
  if (!evidence.sectionsWithContent.has("languages") && !hasAnyCoreSectionContent(evidence)) {
    return { strength: "unknown", explanation: "Languages section not yet read." };
  }
  return { strength: "missing", explanation: "No languages listed on the profile." };
}

// Bare role-marker criteria like "mentor" or "leadership" search all evidence, no domain
// overlap required, leading a team is leading a team regardless of field.
function evaluateRoleMarker(
  profile: LinkedInProfile,
  evidence: ProfileEvidence,
  concept: CriterionConcept,
): SemanticMatchResult {
  const pool = concept.domains.length > 0 ? evidence.all.filter((item) => item.domains.some((d) => concept.domains.includes(d))) : evidence.all;
  const markerWords = concept.requiredMarker === "mentor" ? MENTOR_TRIGGER_WORDS.concat(["coach", "coached", "coaching", "tutor", "tutored", "advisor"]) : LEADER_WORDS;

  const markerMatch = pool.find((item) => matchesAny(item.text.toLowerCase(), markerWords));
  if (markerMatch) {
    return {
      strength: "strong",
      evidence: toSemanticEvidence(markerMatch, sectionLabelFor(profile, markerMatch)),
      explanation: `Direct ${concept.requiredMarker} language found: "${truncateSnippet(markerMatch.text)}".`,
    };
  }

  if (pool.length > 0) {
    const best = pool.reduce((a, b) => (b.roleLevel > a.roleLevel ? b : a));
    return {
      strength: "weak",
      partialEvidence: toSemanticEvidence(best, sectionLabelFor(profile, best)),
      explanation: `Related context found, but no direct evidence of ${concept.requiredMarker === "mentor" ? "mentoring" : "leadership"}.`,
    };
  }

  if (!hasAnyCoreSectionContent(evidence)) {
    return { strength: "unknown", explanation: "Not enough of the profile has loaded to judge this yet." };
  }
  return { strength: "missing", explanation: `No ${concept.requiredMarker === "mentor" ? "mentoring" : "leadership"} evidence found.` };
}

// Seniority-style criteria need a domain overlap. Strength depends on how far the best
// evidence's role level is from what's asked for, not on a marker word being present.
function evaluateSeniority(
  profile: LinkedInProfile,
  evidence: ProfileEvidence,
  concept: CriterionConcept,
): SemanticMatchResult {
  const domainMatches =
    concept.domains.length > 0 ? evidence.all.filter((item) => item.domains.some((d) => concept.domains.includes(d))) : evidence.all;

  if (domainMatches.length === 0) {
    if (!hasAnyCoreSectionContent(evidence)) {
      return { strength: "unknown", explanation: "Not enough of the profile has loaded to judge this yet." };
    }
    return { strength: "missing", explanation: "No relevant evidence found for this criterion." };
  }

  const best = domainMatches.reduce((a, b) => (b.roleLevel > a.roleLevel ? b : a));
  const gap = best.roleLevel - concept.requiredRoleLevel;
  const label = sectionLabelFor(profile, best);

  if (gap >= 0) {
    return {
      strength: "strong",
      evidence: toSemanticEvidence(best, label),
      explanation: `Direct evidence found: "${truncateSnippet(best.text)}".`,
    };
  }
  if (gap >= -2) {
    return {
      strength: "moderate",
      evidence: toSemanticEvidence(best, label),
      explanation: `Closely related evidence found: "${truncateSnippet(best.text)}".`,
    };
  }
  return {
    strength: "weak",
    partialEvidence: toSemanticEvidence(best, label),
    explanation: `Only loosely related evidence found: "${truncateSnippet(best.text)}".`,
  };
}

// The keyword tier for criteria the concept graph has no opinion about, like a specific
// technology or school name. Exact-phrase matching already ran and failed by this point.
// Falls through to "unknown" when no core section has loaded, matching every other evaluator.
function evaluateKeywordFallback(criterion: Criterion, profile: LinkedInProfile, evidence: ProfileEvidence): SemanticMatchResult {
  const keywords = significantKeywords(criterion.label);
  if (keywords.length === 0) return { strength: "unknown", explanation: "This criterion has no specific terms to search for." };

  const fields = profileTextFields(profile);
  const stemmedKeywords = keywords.map(stem);
  let bestPartial: { field: (typeof fields)[number]; matchedCount: number } | null = null;

  for (const field of fields) {
    const fieldWords = new Set(normalizeText(field.text).split(" ").filter(Boolean).map(stem));
    const matchedCount = stemmedKeywords.filter((keyword) => fieldWords.has(keyword)).length;
    if (matchedCount === keywords.length) {
      return {
        strength: "moderate",
        evidence: { fieldLabel: field.label, snippet: truncateSnippet(field.text), sourceSection: field.section },
        explanation: `All key terms found together in ${field.label}.`,
      };
    }
    if (matchedCount > 0 && (!bestPartial || matchedCount > bestPartial.matchedCount)) {
      bestPartial = { field, matchedCount };
    }
  }

  if (bestPartial) {
    return {
      strength: "weak",
      partialEvidence: {
        fieldLabel: bestPartial.field.label,
        snippet: truncateSnippet(bestPartial.field.text),
        sourceSection: bestPartial.field.section,
      },
      explanation: `Related mention found in ${bestPartial.field.label}, but not a clear match.`,
    };
  }

  if (!hasAnyCoreSectionContent(evidence)) {
    return { strength: "unknown", explanation: "Not enough of the profile has loaded to judge this yet." };
  }
  return { strength: "missing", explanation: "No mention found on the profile." };
}

// Evaluates one criterion against a profile's evidence. Exact matching runs first, the
// concept graph only takes over when it has an opinion and exact matching found nothing.
export function evaluateCriterion(
  criterion: Criterion,
  profile: LinkedInProfile,
  evidence: ProfileEvidence,
): SemanticMatchResult {
  const exactCheck = tryExactPhrase(criterion, profile);
  if (exactCheck) return exactCheck;

  const concept = parseCriterionConcept(criterion.label);
  if (concept.isMultilingual) return evaluateMultilingual(evidence);
  if (concept.requiredMarker) return evaluateRoleMarker(profile, evidence, concept);
  if (concept.isConceptual) return evaluateSeniority(profile, evidence, concept);

  return evaluateKeywordFallback(criterion, profile, evidence);
}

function tryExactPhrase(criterion: Criterion, profile: LinkedInProfile): SemanticMatchResult | null {
  const keywords = significantKeywords(criterion.label);
  if (keywords.length === 0) return null;

  const normalizedCriterion = normalizeText(criterion.label);
  for (const field of profileTextFields(profile)) {
    const normalizedField = normalizeText(field.text);
    const matchIndex = normalizedField.indexOf(normalizedCriterion);
    if (matchIndex !== -1) {
      return {
        strength: "strong",
        evidence: { fieldLabel: field.label, snippet: truncateSnippet(field.text, matchIndex), sourceSection: field.section },
        explanation: `Exact match found in ${field.label}.`,
      };
    }
  }
  return null;
}

export { DOMAIN_CONCEPTS };
