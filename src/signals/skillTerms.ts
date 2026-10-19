// Skills & Tools only ever mark words inside evidence Signal Mode already chose, so a technical
// noun elsewhere on the page is never highlighted. The terms are the person's own listed skills
// plus a short list of well-known tools, which covers the skills LinkedIn hides behind "Show all".
export const KNOWN_TOOLS = [
  "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "C", "Go", "Rust", "Swift", "Kotlin", "Ruby", "PHP", "SQL", "R", "MATLAB",
  "HTML", "CSS", "React", "Next.js", "Node.js", "Vue", "Angular", "Svelte", "Express", "Django", "Flask", "Spring", "Tailwind",
  "AWS", "Azure", "GCP", "Google Cloud", "Firebase", "Supabase", "Docker", "Kubernetes", "Git", "GitHub", "Linux",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "GraphQL", "TensorFlow", "PyTorch", "Pandas", "NumPy", "Tableau", "Power BI",
  "Excel", "Figma", "Photoshop", "Illustrator", "Premiere Pro", "After Effects", "Canva", "AutoCAD", "SolidWorks", "Fusion 360",
  "Unity", "Unreal Engine", "Arduino", "Raspberry Pi", "Salesforce", "Jira",
  ".NET", "ASP.NET", "ASP.NET Core", "WPF", "Laravel", "Rails", "Ruby on Rails", "jQuery", "Bootstrap", "Sass", "Vite", "Webpack",
  "Blender", "Maya", "Cinema 4D", "Lightroom", "InDesign", "DaVinci Resolve", "Final Cut Pro", "CapCut", "Procreate", "Sketch",
  "Scratch", "LabVIEW", "Simulink", "Verilog", "VHDL", "Assembly", "Bash", "PowerShell", "Dart", "Flutter", "React Native", "Xcode",
  "Android Studio", "Visual Studio", "VS Code", "Postman", "Vercel", "Netlify", "Heroku", "Snowflake", "BigQuery", "Spark", "Hadoop",
  "scikit-learn", "Keras", "OpenCV", "Jupyter", "SPSS", "Stata", "Notion", "Trello", "WordPress", "Shopify", "Webflow",
];

// Single letters and very common words are too ambiguous to find inside free text.
const AMBIGUOUS = new Set(["c", "r", "go", "excel", "express", "spring", "swift", "unity", "rust"]);

/** "Python (Programming Language)" is listed that way, but written "Python" in descriptions. */
function cleanSkill(skill: string): string {
  return skill.replace(/\s*\(.*?\)\s*/g, " ").trim();
}

export function skillTerms(profileSkills: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of [...profileSkills.map(cleanSkill), ...KNOWN_TOOLS]) {
    const key = raw.toLowerCase();
    if (!raw || raw.length > 40 || seen.has(key)) continue;
    // A known ambiguous tool still counts when the person lists it as a skill.
    if (AMBIGUOUS.has(key) && !profileSkills.some((s) => cleanSkill(s).toLowerCase() === key)) continue;
    seen.add(key);
    terms.push(raw);
  }
  return terms;
}

const WORD = /[\p{L}\p{N}]/u;

/** Each term found in the quote, as the quote spells it, longest first and never overlapping. */
export function skillsIn(quote: string, terms: string[], limit = 3): string[] {
  const lower = quote.toLowerCase();
  const taken: [number, number][] = [];
  const found: { at: number; text: string }[] = [];
  for (const term of [...terms].sort((a, b) => b.length - a.length)) {
    const needle = term.toLowerCase();
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
      const end = at + needle.length;
      // "C" inside "C++" or "React" inside "Reactive" is not the term itself.
      if (WORD.test(lower[at - 1] ?? "") || WORD.test(lower[end] ?? "") || /[+#]/.test(lower[end] ?? "")) continue;
      if (taken.some(([s, e]) => at < e && end > s)) continue;
      taken.push([at, end]);
      found.push({ at, text: quote.slice(at, end) });
      break;
    }
  }
  // A run of listed skills ("Python, C++, C#") reads as one mark, not a row of separate ones.
  const spans: { at: number; end: number }[] = [];
  for (const f of found.sort((a, b) => a.at - b.at)) {
    const last = spans.at(-1);
    if (last && LIST_GAP.test(quote.slice(last.end, f.at))) last.end = f.at + f.text.length;
    else spans.push({ at: f.at, end: f.at + f.text.length });
  }
  return spans.slice(0, limit).map((s) => quote.slice(s.at, s.end));
}

const LIST_GAP = /^\s*(?:,|\/|&|and|,\s*and)\s*$/i;
