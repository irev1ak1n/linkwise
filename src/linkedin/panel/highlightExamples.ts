// Fixture content for each highlight category's Live Preview: four miniature LinkedIn pieces
// (a post, an Experience entry, Skills, Education), each with fixed spans for every category.
// Deterministic on purpose: a preview never asks for an analysis. Made-up people and text, never
// anyone's real profile.
import type { HighlightRuleId } from "./settingsNav";

type FixtureRule = Exclude<HighlightRuleId, "keywords">;
type Span = readonly [start: number, end: number];

export interface PreviewText {
  text: string;
  /** Character ranges each category highlights, resolved once when the fixture loads. */
  spans: Partial<Record<FixtureRule, Span[]>>;
}

// Spans are written as the phrases they cover and turned into offsets here, once. A phrase that is
// not in the text is a fixture mistake, so it fails loudly instead of quietly highlighting nothing.
function preview(text: string, phrases: Partial<Record<FixtureRule, string[]>> = {}): PreviewText {
  const spans: PreviewText["spans"] = {};
  for (const [rule, list] of Object.entries(phrases) as [FixtureRule, string[]][]) {
    spans[rule] = list.map((phrase) => {
      const start = text.indexOf(phrase);
      if (start === -1) throw new Error(`Preview phrase "${phrase}" is not in "${text}"`);
      return [start, start + phrase.length] as const;
    });
  }
  return { text, spans };
}

export const PREVIEW_POST = {
  author: "Alex Chen",
  degree: "3rd",
  headline: preview("Software Engineer at Google", { roles: ["Software Engineer"] }),
  time: "2d",
  body: preview(
    "Excited to share that I led the development of a full-stack web application used by 10,000+ students, improving engagement by 40%. I worked with a team of 5 developers using React, Python, and AWS to design and launch the platform. This project also earned 1st place at our regional hackathon.",
    {
      numbers: ["10,000+", "40%", "team of 5", "1st place"],
      impact: ["used by 10,000+ students", "improving engagement by 40%"],
      leadership: ["led the development", "team of 5 developers"],
      skills: ["React", "Python", "AWS"],
      achievements: ["1st place", "regional hackathon"],
      projects: ["full-stack web application", "platform"],
    },
  ),
  reactions: preview("You and 124 others", { numbers: ["124"] }),
  comments: "8 comments",
};

export const PREVIEW_EXPERIENCE = {
  title: preview("Software Developer Intern", { roles: ["Software Developer Intern"] }),
  meta: preview("Microsoft · Jun 2024 – Aug 2024", { numbers: ["Jun 2024 – Aug 2024"] }),
  bullets: [
    preview("Built and maintained internal tools used by 500+ employees, improving workflow efficiency by 30%.", {
      numbers: ["500+", "30%"],
      impact: ["used by 500+ employees", "improving workflow efficiency by 30%"],
      projects: ["internal tools"],
    }),
    preview("Developed features using TypeScript, React, and Azure.", { skills: ["TypeScript", "React", "Azure"], projects: ["features"] }),
    preview("Collaborated with a team of 4 engineers across 2 product teams.", {
      numbers: ["team of 4", "2 product teams"],
      leadership: ["Collaborated with a team of 4 engineers"],
    }),
  ],
};

export const PREVIEW_SKILLS: { name: string; rules: HighlightRuleId[] }[] = ["Python", "C++", "React", "Node.js", "AWS", "Docker", "SQL", "Blender"].map((name) => ({
  name,
  rules: ["skills"],
}));

export const PREVIEW_EDUCATION = {
  degree: preview("B.S. in Computer Science"),
  meta: preview("Stanford University · 2024 – 2028", { numbers: ["2024 – 2028"] }),
  coursework: preview("Relevant coursework: AI, Machine Learning, Database Systems, Computer Vision", {
    skills: ["AI", "Machine Learning", "Database Systems", "Computer Vision"],
  }),
  // Only the Languages page shows this line: none of the other pieces mention a spoken language.
  languages: preview("Languages: English, Spanish, Arabic", { languages: ["English", "Spanish", "Arabic"] }),
};

export interface PreviewSegment {
  text: string;
  marked: boolean;
}

// Keywords are the user's own words, so they are the one thing found at render time: whole words
// only, so "AI" never lights up inside "maintained".
function keywordSpans(text: string, keywords: string[]): Span[] {
  const lower = text.toLowerCase();
  const word = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
  return keywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0)
    .flatMap((k) => {
      const found: Span[] = [];
      for (let at = lower.indexOf(k); at !== -1; at = lower.indexOf(k, at + 1)) {
        if (!word(lower[at - 1]) && !word(lower[at + k.length])) found.push([at, at + k.length]);
      }
      return found;
    });
}

/** The text split into plain and highlighted parts for one category. */
export function previewSegments(item: PreviewText, rule: HighlightRuleId, keywords: string[] = []): PreviewSegment[] {
  const spans = [...(rule === "keywords" ? keywordSpans(item.text, keywords) : (item.spans[rule] ?? []))].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const segments: PreviewSegment[] = [];
  let at = 0;
  for (const [start, end] of spans) {
    // Overlapping spans of one category read as one mark.
    if (end <= at) continue;
    const from = Math.max(start, at);
    if (from > at) segments.push({ text: item.text.slice(at, from), marked: false });
    segments.push({ text: item.text.slice(from, end), marked: true });
    at = end;
  }
  if (at < item.text.length) segments.push({ text: item.text.slice(at), marked: false });
  return segments;
}

/** Whether a skill pill is highlighted on this category's page. */
export function skillMarked(skill: { name: string; rules: HighlightRuleId[] }, rule: HighlightRuleId, keywords: string[] = []): boolean {
  return rule === "keywords" ? keywords.some((k) => k.trim().toLowerCase() === skill.name.toLowerCase()) : skill.rules.includes(rule);
}
