import { describe, expect, it } from "vitest";
import type { Grades, SemanticLabel, SignalFactType } from "../ai/signalTypes";
import { rankSignals, type RankCandidate } from "./signalRanking";
import { planHighlights, sentenceIndex } from "./signalPlan";
import { signalTargets } from "../linkedin/signalRuntime";
import { DEFAULT_HIGHLIGHT_PREFERENCES, HIGHLIGHT_CATEGORIES, type HighlightPreferences } from "./highlightCategories";

const NONE: Grades = { impact: 0, ownership: 0, result: 0, scale: 0, selectivity: 0, leadership: 0, technicalDepth: 0, sustainedDepth: 0, specificity: 1, distinctiveness: 0, genericness: 0 };

// A synthetic long Education description, written like a student's real one: an early start, an
// advanced program meant for older students, a ranking, long training, a long skill list, a
// diploma, and a final project. Grades are what a careful reader would give each claim.
const TEXT =
  "Northfield Coding School — Advanced Diploma, Software Engineering — 2015 – 2024 — " +
  "I began studying at Northfield Coding School at age 7. " +
  "From the start, the school focused on hands-on practice and solving real problems rather than on theory alone. " +
  "At age 12, I was admitted into the Advanced Engineering track (a track intended for students aged 17 and older) because of my top score on the school's coding exam. " +
  "Over 9 years, I learned Python, Java, C#, SQL, JavaScript, Go, Rust, web design, and data analysis. " +
  "I also explored the creative side of technology through digital art, video editing, and 3D modeling. " +
  "In 2024, I graduated with an Advanced Diploma in Software Engineering after building and presenting a full-stack capstone application.";

interface Claim {
  quote: string;
  type: SignalFactType;
  grades: Partial<Grades>;
  claim?: "main" | "support";
  group: number;
  labels: SemanticLabel[];
  metrics?: string[];
}

const CLAIMS: Claim[] = [
  { quote: "I began studying at Northfield Coding School at age 7", type: "milestone", grades: { distinctiveness: 3, specificity: 3, sustainedDepth: 0, selectivity: 0 }, group: 1, labels: ["milestone", "training"], metrics: ["age 7"] },
  { quote: "At age 12, I was admitted into the Advanced Engineering track", type: "selective_admission", grades: { selectivity: 3, distinctiveness: 3, specificity: 3 }, group: 2, labels: ["selectivity", "milestone"], metrics: ["age 12"] },
  { quote: "a track intended for students aged 17 and older", type: "distinction", grades: { selectivity: 2, distinctiveness: 3, specificity: 3 }, claim: "support", group: 2, labels: ["distinction"] },
  { quote: "my top score on the school's coding exam", type: "competition_result", grades: { selectivity: 2, result: 2, distinctiveness: 2, specificity: 2 }, claim: "support", group: 2, labels: ["achievement"] },
  { quote: "Over 9 years, I learned Python, Java, C#, SQL", type: "sustained_training", grades: { sustainedDepth: 3, technicalDepth: 2, distinctiveness: 2, specificity: 2 }, group: 3, labels: ["training", "duration", "skill"], metrics: ["9 years"] },
  { quote: "Python", type: "skill", grades: { technicalDepth: 1, specificity: 2 }, group: 4, labels: ["skill"] },
  { quote: "Rust", type: "skill", grades: { technicalDepth: 1, specificity: 2 }, group: 5, labels: ["skill"] },
  { quote: "graduated with an Advanced Diploma in Software Engineering", type: "credential", grades: { result: 3, distinctiveness: 2, specificity: 3 }, group: 6, labels: ["credential", "completion", "education"] },
  { quote: "building and presenting a full-stack capstone application", type: "technical_execution", grades: { ownership: 3, technicalDepth: 3, result: 2, specificity: 3, distinctiveness: 2 }, group: 7, labels: ["project", "technical_execution", "completion"] },
];

function candidates(text = TEXT, claims = CLAIMS, itemKey = "edu"): RankCandidate[] {
  return claims.map((c) => {
    const position = text.indexOf(c.quote);
    if (position === -1) throw new Error(`not in text: ${c.quote}`);
    return {
      id: `${itemKey}|${c.quote.toLowerCase()}`,
      itemKey,
      evidenceId: "education:0",
      section: "education",
      itemOrder: 0,
      position,
      itemLength: text.length,
      quote: c.quote,
      fact: c.quote,
      type: c.type,
      grades: { ...NONE, ...c.grades },
      goalRelevance: 0,
      confidence: 0.9,
      metrics: c.metrics ?? [],
      claim: c.claim ?? "main",
      group: c.group,
      labels: c.labels,
      sentence: sentenceIndex(text, position),
    };
  });
}

const plan = (cs = candidates()) => {
  const ranking = rankSignals(cs, { goalActive: false });
  return { ranking, highlights: planHighlights(ranking, new Map([["education:0", TEXT]])) };
};
const chosen = (cs = candidates()) => {
  const { ranking } = plan(cs);
  return [...ranking.core, ...ranking.discovery].map((c) => c.quote);
};
const prefsWith = (patch: Partial<Record<keyof HighlightPreferences["categories"], boolean>>): HighlightPreferences => ({
  ...DEFAULT_HIGHLIGHT_PREFERENCES,
  categories: Object.fromEntries(HIGHLIGHT_CATEGORIES.map((c) => [c, { ...DEFAULT_HIGHLIGHT_PREFERENCES.categories[c], enabled: patch[c] ?? true }])) as HighlightPreferences["categories"],
});

describe("long-text claims", () => {

  it("reads the narrative: early start, advanced admission, long training, diploma, and final project, not just a number or a skill", () => {
    const picked = chosen();
    expect(picked).toEqual(
      expect.arrayContaining([
        "I began studying at Northfield Coding School at age 7",
        "At age 12, I was admitted into the Advanced Engineering track",
        "Over 9 years, I learned Python, Java, C#, SQL",
        "graduated with an Advanced Diploma in Software Engineering",
        "building and presenting a full-stack capstone application",
      ]),
    );
    expect(picked).not.toContain("Python");
    expect(picked).not.toContain("Rust");
  });

  it("brings a main claim's supporting clauses with it", () => {
    const picked = chosen();
    expect(picked).toContain("a track intended for students aged 17 and older");
  });

  it("never shows a supporting clause without its main claim", () => {
    // The main admission claim is weak here, so it is not chosen; its supports must not stand alone.
    const weakMain = candidates().map((c) => (c.group === 2 && c.claim === "main" ? { ...c, grades: { ...NONE }, confidence: 0.2 } : c));
    const picked = chosen(weakMain);
    expect(picked).not.toContain("At age 12, I was admitted into the Advanced Engineering track");
    expect(picked).not.toContain("a track intended for students aged 17 and older");
    expect(picked).not.toContain("my top score on the school's coding exam");
  });

  it("ranks a selective admission above an isolated skill name", () => {
    const { ranking } = plan();
    const score = (q: string) => ranking.debug.find((r) => r.quote === q)!.score;
    expect(score("At age 12, I was admitted into the Advanced Engineering track")).toBeGreaterThan(score("Python"));
  });

  it("gives a long narrative item enough room, while a short one stays small", () => {
    const picked = chosen().filter((q) => CLAIMS.find((c) => c.quote === q)?.claim !== "support");
    expect(picked.length).toBeGreaterThanOrEqual(5);
    const short = "Robotics Club — Member — Built a line-following robot.";
    const shortClaims: Claim[] = [{ quote: "Built a line-following robot", type: "technical_execution", grades: { ownership: 3, technicalDepth: 2, specificity: 3 }, group: 1, labels: ["project"] }];
    expect(chosen(candidates(short, shortClaims, "club"))).toHaveLength(1);
  });

  it("chooses the same claims every time for the same evidence", () => {
    const first = plan().ranking.core.map((c) => c.id);
    for (let i = 0; i < 5; i++) expect(plan().ranking.core.map((c) => c.id)).toEqual(first);
  });

  it("records each claim's sentence, role, group, and labels for debugging", () => {
    const record = plan().ranking.debug.find((r) => r.quote === "a track intended for students aged 17 and older")!;
    expect(record).toMatchObject({ claim: "support", group: "edu#2", labels: ["distinction"], sentence: sentenceIndex(TEXT, TEXT.indexOf("a track intended")) });
  });
});

describe("style plan", () => {
  const layers = (prefs = DEFAULT_HIGHLIGHT_PREFERENCES) => Object.fromEntries(signalTargets(plan().highlights, prefs).map((t) => [t.quote, t.layer]));

  it("colors claims by kind, and keeps important uncategorized claims in the general Signal color", () => {
    const l = layers();
    expect(l["I began studying at Northfield Coding School at age 7"]).toBe("general");
    expect(l["Over 9 years, I learned Python, Java, C#, SQL"]).toBe("general");
    expect(l["graduated with an Advanced Diploma in Software Engineering"]).toBe("achievements");
    expect(l["At age 12, I was admitted into the Advanced Engineering track"]).toBe("achievements");
  });

  it("shows several kinds of color in one sentence: the claim, its number, its supporting clause", () => {
    const targets = signalTargets(plan().highlights);
    const admission = targets.find((t) => t.quote.startsWith("At age 12"))!;
    expect(admission.metrics).toEqual(["age 12"]);
    const sentence = targets.filter((t) => t.sentence === admission.sentence);
    expect(sentence.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps Skills off from emptying the paragraph", () => {
    const l = layers(prefsWith({ skills: false }));
    expect(Object.keys(l)).toEqual(expect.arrayContaining(["graduated with an Advanced Diploma in Software Engineering", "I began studying at Northfield Coding School at age 7"]));
  });

  it("still shows general Signal claims with every category switched off", () => {
    const allOff = prefsWith(Object.fromEntries(HIGHLIGHT_CATEGORIES.map((c) => [c, false])));
    const l = layers(allOff);
    expect(Object.values(l).every((layer) => layer === "general")).toBe(true);
    expect(Object.keys(l)).toEqual(expect.arrayContaining(["I began studying at Northfield Coding School at age 7", "Over 9 years, I learned Python, Java, C#, SQL"]));
  });

  it("hides a supporting clause together with its switched-off main claim", () => {
    const l = layers(prefsWith({ achievements: false }));
    expect(l["At age 12, I was admitted into the Advanced Engineering track"]).toBeUndefined();
    expect(l["a track intended for students aged 17 and older"]).toBeUndefined();
  });

  it("counts a supporting clause as part of its claim, not as a signal of its own", () => {
    const targets = signalTargets(plan().highlights);
    expect(targets.find((t) => t.quote === "a track intended for students aged 17 and older")!.counted).toBe(false);
    expect(targets.find((t) => t.quote.startsWith("At age 12"))!.counted).toBe(true);
  });

  it("drops skill marks, then number marks, before a sentence carries more than three colors", () => {
    const sentence = "e:1";
    const highlights = [
      { evidenceId: "e", section: "about" as const, quote: "Led a 5-person team in React", type: "core" as const, importance: 1, metrics: ["5-person"], category: "leadership" as const, sentence },
      { evidenceId: "e", section: "about" as const, quote: "won 2nd place", type: "core" as const, importance: 1, metrics: ["2nd place"], category: "achievements" as const, sentence },
    ];
    const targets = signalTargets(highlights, DEFAULT_HIGHLIGHT_PREFERENCES, ["React"]);
    expect(targets.flatMap((t) => t.skills ?? [])).toEqual([]);
    expect(targets.flatMap((t) => t.metrics)).toEqual(["5-person", "2nd place"]);
  });
});

describe("planHighlights", () => {
  it("joins touching claims of the same kind into one highlight", () => {
    const text = "Shipped a full-stack, mobile-first booking app for clinics.";
    const claims: Claim[] = [
      { quote: "Shipped a full-stack", type: "technical_execution", grades: { ownership: 3, technicalDepth: 3, specificity: 3, distinctiveness: 2 }, group: 1, labels: ["project"] },
      { quote: "mobile-first booking app for clinics", type: "project_ownership", grades: { ownership: 3, technicalDepth: 2, specificity: 3, distinctiveness: 2 }, group: 2, labels: ["project"] },
    ];
    const ranking = rankSignals(candidates(text, claims, "x"), { goalActive: false });
    const highlights = planHighlights(ranking, new Map([["education:0", text]]));
    expect(highlights.map((h) => h.quote)).toEqual(["Shipped a full-stack, mobile-first booking app for clinics"]);
  });

  it("finds a claim's sentence within its item", () => {
    // Three entry parts (title, organization, dates), then a sentence at a time.
    expect(sentenceIndex(TEXT, TEXT.indexOf("I began"))).toBe(3);
    expect(sentenceIndex(TEXT, TEXT.indexOf("At age 12"))).toBe(5);
    // A parenthetical stays in its sentence.
    expect(sentenceIndex(TEXT, TEXT.indexOf("a track intended"))).toBe(5);
  });
});

describe("narrative coverage", () => {
  const about =
    "I'm an aspiring software engineer and a high-school senior. I'm motivated by complex challenges and the process of building things. " +
    "After 6 years of studying software at a coding school, I now focus on freelance work and independent projects, and I tutor younger students in Python. " +
    "Outside of code I enjoy chess, long-distance running, and photography, and I am always looking for new problems to think about with other curious people.";
  const aboutClaims: Claim[] = [
    { quote: "a high-school senior", type: "education", grades: { specificity: 2, distinctiveness: 1 }, group: 1, labels: ["education", "milestone"] },
    { quote: "I'm motivated by complex challenges", type: "self_description", grades: { genericness: 3 }, group: 2, labels: [] },
    { quote: "I now focus on freelance work and independent projects", type: "responsibility", grades: { ownership: 2, specificity: 2, distinctiveness: 1 }, group: 3, labels: ["ownership"] },
    { quote: "I tutor younger students in Python", type: "teaching_scope", grades: { ownership: 1, impact: 1, specificity: 2 }, group: 4, labels: ["teaching"] },
  ];
  const aboutCandidates = () => candidates(about, aboutClaims, "about").map((c) => ({ ...c, section: "about" as const, evidenceId: "about:0" }));

  it("shows the best real claims of a long About even when none would make the cut alone", () => {
    const strongElsewhere = candidates();
    // The rest of a realistic profile: long items whose only claims are too weak to show.
    const rest = [1, 2, 3, 4].map((i) => ({ ...candidates()[5]!, id: `filler${i}|x`, itemKey: `filler${i}`, evidenceId: `experience:${i}`, section: "experience" as const, itemLength: 900 }));
    const ranking = rankSignals([...strongElsewhere, ...rest, ...aboutCandidates()], { goalActive: false });
    const fromAbout = [...ranking.core, ...ranking.discovery].filter((c) => c.itemKey === "about").map((c) => c.quote);
    expect(fromAbout).toHaveLength(2);
    expect(fromAbout).not.toContain("I'm motivated by complex challenges");
  });

  it("decides a claim's color by its main kind only", () => {
    const ranking = rankSignals(candidates(), { goalActive: false });
    const training = planHighlights(ranking, new Map([["education:0", TEXT]])).find((h) => h.quote.startsWith("Over 9 years"))!;
    // Its labels are training, duration, skill: no settings kind leads, so it stays general.
    expect(training.category).toBe("general");
  });
});

describe("joined claims", () => {
  it("closes a parenthesis the joined span opened", () => {
    const text = "At age 12, I was admitted into the Advanced track (a track for students aged 17 and older) because of my exam score.";
    const claims: Claim[] = [
      { quote: "At age 12, I was admitted into the Advanced track", type: "selective_admission", grades: { selectivity: 3, distinctiveness: 3, specificity: 3 }, group: 1, labels: ["selectivity"] },
      { quote: "a track for students aged 17 and older", type: "distinction", grades: { selectivity: 2, distinctiveness: 3, specificity: 3 }, claim: "support", group: 1, labels: ["selectivity", "distinction"] },
    ];
    const ranking = rankSignals(candidates(text, claims, "y"), { goalActive: false });
    const highlights = planHighlights(ranking, new Map([["education:0", text]]));
    expect(highlights.map((h) => h.quote)).toEqual(["At age 12, I was admitted into the Advanced track (a track for students aged 17 and older)"]);
  });
});
