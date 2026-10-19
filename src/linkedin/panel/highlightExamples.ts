// Fixture content for each highlight category's Live Preview: four miniature LinkedIn pieces
// (a post, an Experience entry, Skills, Education) and, for every category, the exact phrases it
// would highlight in them. Deterministic on purpose: a preview never asks for an analysis. Made-up
// people and text, never anyone's real profile.
import type { HighlightRuleId } from "./settingsNav";

type Marks = Partial<Record<HighlightRuleId, string[]>>;

export interface PreviewText {
  text: string;
  marks: Marks;
}

export const PREVIEW_POST = {
  author: "Alex Chen",
  degree: "3rd",
  headline: { text: "Software Engineer at Google", marks: { roles: ["Software Engineer"] } } satisfies PreviewText,
  time: "2d",
  body: {
    text: "Excited to share that I led the development of a full-stack web application used by 10,000+ students, improving engagement by 40%. I worked with a team of 5 developers using React, Python, and AWS to design and launch the platform. This project also earned 1st place at our regional hackathon.",
    marks: {
      numbers: ["10,000+", "40%", "team of 5", "1st place"],
      impact: ["used by 10,000+ students", "improving engagement by 40%"],
      leadership: ["led the development", "team of 5 developers"],
      skills: ["React, Python, and AWS"],
      achievements: ["1st place at our regional hackathon"],
      projects: ["full-stack web application"],
    },
  } satisfies PreviewText,
  reactions: "You and 124 others",
  comments: "8 comments",
};

export const PREVIEW_EXPERIENCE = {
  title: { text: "Software Developer Intern", marks: { roles: ["Software Developer Intern"] } } satisfies PreviewText,
  meta: "Microsoft · Jun 2024 – Aug 2024",
  bullets: [
    {
      text: "Built and maintained internal tools used by 500+ employees, improving workflow efficiency by 30%.",
      marks: {
        numbers: ["500+", "30%"],
        impact: ["used by 500+ employees", "improving workflow efficiency by 30%"],
        projects: ["Built and maintained internal tools"],
      },
    },
    { text: "Developed features using TypeScript, React, and Azure.", marks: { skills: ["TypeScript, React, and Azure"] } },
    { text: "Collaborated with a team of 4 engineers across 2 product teams.", marks: { numbers: ["team of 4", "2 product teams"] } },
  ] satisfies PreviewText[],
};

// Skills are highlighted where the person's evidence uses them (here: the post above), the way
// Signal Mode marks listed skills inside highlighted evidence, so not every pill lights up.
export const PREVIEW_SKILLS: { name: string; marks: HighlightRuleId[] }[] = [
  { name: "Python", marks: ["skills"] },
  { name: "C++", marks: [] },
  { name: "React", marks: ["skills"] },
  { name: "Node.js", marks: [] },
  { name: "AWS", marks: ["skills"] },
  { name: "Docker", marks: [] },
  { name: "SQL", marks: [] },
  { name: "Blender", marks: [] },
];

export const PREVIEW_EDUCATION = {
  degree: { text: "B.S. in Computer Science", marks: {} } satisfies PreviewText,
  // Years are dates, never meaningful numbers, so nothing here is highlighted for Numbers.
  meta: "Stanford University · 2024 – 2028",
  coursework: {
    text: "Relevant coursework: AI, Machine Learning, Database Systems, Computer Vision",
    marks: { skills: ["AI, Machine Learning, Database Systems, Computer Vision"] },
  } satisfies PreviewText,
  // Only the Languages page shows this line: none of the other pieces mention a spoken language.
  languages: { text: "Languages: English, Spanish, Arabic", marks: { languages: ["English", "Spanish", "Arabic"] } } satisfies PreviewText,
};

export interface PreviewSegment {
  text: string;
  marked: boolean;
}

/** The text split into plain and highlighted parts for one category. Keywords are matched from
 * the user's own list, the way they are on a profile. */
export function previewSegments(item: PreviewText, rule: HighlightRuleId, keywords: string[] = []): PreviewSegment[] {
  const phrases = rule === "keywords" ? keywords : (item.marks[rule] ?? []);
  const lower = item.text.toLowerCase();
  const ranges = phrases
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
    .flatMap((p) => occurrences(lower, p).map((start) => ({ start, end: start + p.length })))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const segments: PreviewSegment[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start < at) continue;
    if (r.start > at) segments.push({ text: item.text.slice(at, r.start), marked: false });
    segments.push({ text: item.text.slice(r.start, r.end), marked: true });
    at = r.end;
  }
  if (at < item.text.length) segments.push({ text: item.text.slice(at), marked: false });
  return segments;
}

// Whole words only, so "AI" never lights up inside "maintained".
function occurrences(text: string, phrase: string): number[] {
  const found: number[] = [];
  const word = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    if (!word(text[at - 1]) && !word(text[at + phrase.length])) found.push(at);
  }
  return found;
}

/** Whether a skill pill is highlighted on this category's page. */
export function skillMarked(skill: { name: string; marks: HighlightRuleId[] }, rule: HighlightRuleId, keywords: string[] = []): boolean {
  return rule === "keywords" ? keywords.some((k) => k.toLowerCase() === skill.name.toLowerCase()) : skill.marks.includes(rule);
}
