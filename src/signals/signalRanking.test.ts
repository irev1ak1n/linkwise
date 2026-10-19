import { describe, expect, it } from "vitest";
import { READING_FLOOR, bandFor, rankSignals, readingGrade, readingScore, scoreCandidate, type RankCandidate } from "./signalRanking";
import { fallbackEvidence, heuristicGrades } from "./heuristicGrades";
import type { Grades, SignalFactType, SignalSection } from "../ai/signalTypes";

const NONE: Grades = { impact: 0, ownership: 0, result: 0, scale: 0, selectivity: 0, leadership: 0, technicalDepth: 0, sustainedDepth: 0, specificity: 1, distinctiveness: 0, genericness: 0 };

// Representative grades for kinds of evidence, as a careful classifier would give them.
const KINDS = {
  competition: { type: "competition_result", grades: { selectivity: 3, result: 2, distinctiveness: 3, impact: 1, specificity: 3 } },
  shipped: { type: "project_ownership", grades: { ownership: 3, technicalDepth: 2, impact: 2, scale: 2, specificity: 3, distinctiveness: 2 } },
  dashboard: { type: "technical_execution", grades: { ownership: 3, technicalDepth: 3, impact: 1, specificity: 2, distinctiveness: 2 } },
  ledTeam: { type: "leadership_scope", grades: { leadership: 3, ownership: 2, scale: 1, specificity: 3, distinctiveness: 2 } },
  tutoring: { type: "teaching_scope", grades: { scale: 3, sustainedDepth: 2, impact: 2, ownership: 2, specificity: 3, distinctiveness: 2 } },
  training: { type: "sustained_training", grades: { sustainedDepth: 3, technicalDepth: 1, distinctiveness: 2, specificity: 2 } },
  selective: { type: "selective_admission", grades: { selectivity: 3, distinctiveness: 3, specificity: 2 } },
  costCut: { type: "measurable_impact", grades: { impact: 3, result: 3, scale: 2, ownership: 2, specificity: 3, distinctiveness: 2 } },
  mentored: { type: "leadership_scope", grades: { leadership: 2, ownership: 2, scale: 2, impact: 1, specificity: 3, distinctiveness: 1 } },
  language: { type: "language", grades: { specificity: 2, distinctiveness: 1 } },
  coursework: { type: "coursework", grades: { technicalDepth: 1, specificity: 2, distinctiveness: 1 } },
  member: { type: "membership", grades: { selectivity: 1, distinctiveness: 1 } },
  participated: { type: "membership", grades: { specificity: 1 } },
  interested: { type: "self_description", grades: { genericness: 3 } },
  workshop: { type: "education", grades: { specificity: 1 } },
  skill: { type: "skill", grades: { technicalDepth: 1, specificity: 1 } },
} satisfies Record<string, { type: SignalFactType; grades: Partial<Grades> }>;

let counter = 0;
function candidate(kind: keyof typeof KINDS, quote: string, overrides: Partial<RankCandidate> = {}): RankCandidate {
  const { type, grades } = KINDS[kind];
  const itemKey = overrides.itemKey ?? `item${counter++}`;
  return {
    id: `${itemKey}|${quote.toLowerCase()}`,
    itemKey,
    evidenceId: overrides.evidenceId ?? "experience:0",
    section: "experience",
    itemOrder: 0,
    position: 0,
    itemLength: 600,
    quote,
    fact: quote,
    type,
    grades: { ...NONE, ...grades },
    goalRelevance: 0,
    confidence: 0.9,
    metrics: [],
    ...overrides,
  };
}

const score = (c: RankCandidate, goal = false) => scoreCandidate(c, goal).score;

describe("intrinsic ordering", () => {
  const pairs: [keyof typeof KINDS, keyof typeof KINDS, string][] = [
    ["competition", "member", "a competition placement beats membership"],
    ["shipped", "coursework", "an application people use beats a course"],
    ["ledTeam", "participated", "leading a team beats taking part"],
    ["tutoring", "interested", "150+ tutoring hours beat interest in teaching"],
    ["selective", "workshop", "a competitive admission beats attending a workshop"],
    ["costCut", "skill", "a measured outcome beats a skill name"],
    ["dashboard", "coursework", "real technical work beats a course list"],
  ];
  for (const [strong, weak, label] of pairs) {
    it(label, () => {
      expect(score(candidate(strong, "a"))).toBeGreaterThan(score(candidate(weak, "b")) + 15);
    });
  }

  it("puts strong evidence in high bands and noise in the weak band", () => {
    expect(bandFor(score(candidate("competition", "x")))).toBe("exceptional");
    expect(["exceptional", "strong"]).toContain(bandFor(score(candidate("ledTeam", "x"))));
    expect(bandFor(score(candidate("interested", "x")))).toBe("weak");
    expect(bandFor(score(candidate("member", "x")))).toBe("weak");
  });

  it("lets a low-confidence reading lose to the same evidence read clearly", () => {
    expect(score(candidate("ledTeam", "x", { confidence: 0.4 }))).toBeLessThan(score(candidate("ledTeam", "x", { confidence: 0.95 })));
  });
});

describe("goal relevance", () => {
  it("lifts relevant evidence a little, but never above much stronger evidence", () => {
    const course = candidate("coursework", "Took AP Cybersecurity", { goalRelevance: 3 });
    const project = candidate("shipped", "Built a network security monitor", { goalRelevance: 3 });
    expect(score(course, true)).toBeGreaterThan(score(course, false));
    expect(score(project, true)).toBeGreaterThan(score(course, true));
  });

  it("does not turn vague interest into evidence", () => {
    const vague = candidate("interested", "interested in software", { goalRelevance: 3 });
    expect(bandFor(score(vague, true))).toBe("weak");
  });

  it("keeps most of the core across different goals on the same profile", () => {
    const profile = (relevance: Partial<Record<string, number>>) =>
      [
        candidate("competition", "won 2nd place at the regional conference", { itemKey: "a", goalRelevance: relevance.a ?? 0 }),
        candidate("dashboard", "Built a custom staff dashboard", { itemKey: "b", goalRelevance: relevance.b ?? 0 }),
        candidate("ledTeam", "captained a five-student team", { itemKey: "c", goalRelevance: relevance.c ?? 0 }),
        candidate("tutoring", "completed 150+ tutoring hours", { itemKey: "d", goalRelevance: relevance.d ?? 0 }),
        candidate("language", "Native or bilingual proficiency", { itemKey: "e", section: "languages", goalRelevance: relevance.e ?? 0 }),
        candidate("coursework", "AP Computer Science A", { itemKey: "f", section: "education", goalRelevance: relevance.f ?? 0 }),
      ];
    const core = (r: Partial<Record<string, number>>) => rankSignals(profile(r), { goalActive: true }).core.map((c) => c.itemKey);
    const dev = core({ b: 3, f: 3, a: 1 });
    const leadership = core({ c: 3, d: 2 });
    const shared = dev.filter((k) => leadership.includes(k));
    expect(shared.length).toBeGreaterThanOrEqual(Math.min(dev.length, leadership.length) - 1);
  });
});

describe("rankSignals", () => {
  it("lets real work beat coursework in the core, keeping the course out unless it adds something", () => {
    const result = rankSignals(
      [
        candidate("coursework", "APCSP, APCSA, AP Cybersecurity", { section: "education", itemKey: "edu", goalRelevance: 3 }),
        candidate("shipped", "Built a production website used by 4,000+ students", { itemKey: "x1" }),
        candidate("ledTeam", "Led a five-student team", { itemKey: "x2" }),
        candidate("competition", "Won 2nd place at the regional conference", { itemKey: "x3" }),
      ],
      { goalActive: true },
    );
    expect(result.core.map((c) => c.itemKey)).not.toContain("edu");
    expect(result.core.length).toBeGreaterThanOrEqual(3);
  });

  it("can highlight nothing on a profile with no real evidence", () => {
    const result = rankSignals([candidate("interested", "Passionate about technology", { section: "about" }), candidate("member", "Member of the club")], { goalActive: false });
    expect(result.core).toEqual([]);
    expect(result.discovery).toEqual([]);
    expect(result.debug.every((r) => r.status === "rejected")).toBe(true);
  });

  it("highlights only what is genuinely useful on a sparse profile", () => {
    const result = rankSignals([candidate("ledTeam", "Led the school newspaper"), candidate("participated", "Took part in events")], { goalActive: false });
    expect(result.core.map((c) => c.quote)).toEqual(["Led the school newspaper"]);
  });

  it("keeps one dense experience from taking every highlight", () => {
    const facts = ["Built the ticketing system", "Shipped a mobile scanner app", "Migrated payments to Stripe", "Designed the analytics warehouse", "Automated nightly reporting", "Launched a volunteer portal"];
    const dense = facts.map((q, i) => candidate("shipped", q, { itemKey: "dense", position: i * 40, itemLength: 300 }));
    const others = [candidate("competition", "Won the state final", { itemKey: "h", section: "honors" }), candidate("tutoring", "Tutored 60 students", { itemKey: "v", section: "volunteering" })];
    const result = rankSignals([...dense, ...others], { goalActive: false });
    const fromDense = [...result.core, ...result.discovery].filter((c) => c.itemKey === "dense");
    expect(fromDense.length).toBeLessThanOrEqual(3);
    expect([...result.core, ...result.discovery].map((c) => c.itemKey)).toEqual(expect.arrayContaining(["h", "v"]));
    expect(result.debug.some((r) => r.reason === "SECTION_CAP")).toBe(true);
  });

  it("keeps the strongest wording of one fact repeated across sections", () => {
    const result = rankSignals(
      [
        candidate("ledTeam", "TSA Webmaster team captain", { itemKey: "about", section: "about", fact: "Captained the TSA Webmaster team", grades: { ...NONE, leadership: 2, specificity: 2, distinctiveness: 2 } }),
        candidate("ledTeam", "captained a five-student TSA Webmaster team", { itemKey: "exp", fact: "Captained a five-student TSA Webmaster team" }),
      ],
      { goalActive: false },
    );
    expect(result.core.map((c) => c.itemKey)).toEqual(["exp"]);
    expect(result.debug.find((r) => r.section === "about")?.reason).toBe("DUPLICATE_FACT");
  });

  it("never highlights two overlapping phrases of one item", () => {
    const result = rankSignals(
      [
        candidate("dashboard", "Built a custom staff dashboard", { itemKey: "x", position: 0 }),
        candidate("dashboard", "custom staff dashboard", { itemKey: "x", position: 8, fact: "Staff dashboard" }),
      ],
      { goalActive: false },
    );
    expect(result.core.map((c) => c.quote)).toEqual(["Built a custom staff dashboard"]);
    expect(result.debug.find((r) => r.quote === "custom staff dashboard")?.reason).toBe("OVERLAP");
  });

  it("is deterministic: identical input gives an identical core and pool", () => {
    const input = [
      candidate("competition", "Won A", { itemKey: "1" }),
      candidate("shipped", "Built B", { itemKey: "2" }),
      candidate("ledTeam", "Led C", { itemKey: "3" }),
      candidate("tutoring", "Tutored D", { itemKey: "4" }),
      candidate("training", "Trained E", { itemKey: "5" }),
      candidate("mentored", "Mentored F", { itemKey: "6" }),
      candidate("selective", "Selected G", { itemKey: "7" }),
    ];
    const a = rankSignals(input, { goalActive: false, discoverySeed: 3 });
    const b = rankSignals([...input].reverse(), { goalActive: false, discoverySeed: 3 });
    expect(b.core.map((c) => c.id)).toEqual(a.core.map((c) => c.id));
    expect(b.discovery.map((c) => c.id)).toEqual(a.discovery.map((c) => c.id));
    expect(b.debug.map((r) => r.id)).toEqual(a.debug.map((r) => r.id));
  });

  it("rotates discovery by seed but never the core", () => {
    // More strong facts than the highlight budget, so discovery has a pool to rotate through.
    const input = Array.from({ length: 30 }, (_, i) =>
      candidate(i % 2 ? "mentored" : "tutoring", `Taught workshop ${i} for students`, { itemKey: `k${i}`, section: i < 15 ? "experience" : "volunteering", itemLength: 2000 }),
    );
    const runs = [0, 1, 2, 3].map((seed) => rankSignals(input, { goalActive: false, discoverySeed: seed }));
    for (const run of runs) expect(run.core.map((c) => c.id)).toEqual(runs[0]!.core.map((c) => c.id));
    expect(new Set(runs.map((r) => r.discovery.map((c) => c.id).join())).size).toBeGreaterThan(1);
  });

  it("keeps a core fact on screen unless a newcomer is clearly stronger", () => {
    const incumbent = candidate("ledTeam", "Led a five-student team", { itemKey: "old" });
    const slightlyBetter = candidate("ledTeam", "Led a six-student team", { itemKey: "new", grades: { ...NONE, leadership: 3, ownership: 2, scale: 2, specificity: 3, distinctiveness: 2 } });
    expect(score(slightlyBetter)).toBeGreaterThan(score(incumbent));
    const filler = [candidate("training", "Studied for 9 years", { itemKey: "f" })];
    const first = rankSignals([incumbent, ...filler], { goalActive: false });
    const incumbents = new Set(first.core.map((c) => c.id));
    const next = rankSignals([incumbent, slightlyBetter, ...filler], { goalActive: false, incumbents });
    expect(next.core[0]!.itemKey).toBe("old");
  });

  it("gives Key Evidence the same ranked facts the highlights are drawn from", () => {
    const result = rankSignals(
      [candidate("member", "Member of NHS", { itemKey: "m" }), candidate("competition", "Won 2nd place at regionals", { itemKey: "c" }), candidate("costCut", "Reduced costs 38%", { itemKey: "r" })],
      { goalActive: false },
    );
    expect(result.facts.map((f) => f.text).sort()).toEqual(["Reduced costs 38%", "Won 2nd place at regionals"]);
  });

  it("explains every rejection", () => {
    const result = rankSignals([candidate("interested", "Passionate about code", { itemKey: "p" }), candidate("ledTeam", "Led a team", { itemKey: "l", confidence: 0.2 })], { goalActive: false });
    expect(Object.fromEntries(result.debug.map((r) => [r.quote, r.reason]))).toEqual({ "Passionate about code": "LOW_IMPORTANCE", "Led a team": "LOW_CONFIDENCE" });
  });
});

describe("heuristic fallback grades", () => {
  const item = (section: SignalSection, text: string) => ({ id: `${section}:0`, section, text });

  it("grades a description that directly follows the title, but never the organization", () => {
    expect(heuristicGrades(item("experience", "Web Lead — Led a 4-person web team")).map((c) => c.quote)).toEqual(["Led a 4-person web team"]);
    expect(heuristicGrades(item("experience", "Captain — Led Robotics Club")).map((c) => c.quote)).toEqual([]);
  });

  it("reads contextual numbers as scale, and dates as nothing", () => {
    const [reach] = heuristicGrades(item("experience", "Web Lead — Robotics Club — Reached 500+ users with the new site"));
    expect(reach!.grades.scale).toBeGreaterThan(0);
    expect(heuristicGrades(item("experience", "Web Lead — Robotics Club — Sep 2025 - Present — 2026"))).toEqual([]);
  });

  it("never grades LinkedIn's record metadata as evidence", () => {
    expect(heuristicGrades(item("certifications", "Diploma — Northfield Academy · Issued May 2025 · Credential ID NA-1234 · Skills: Higher Education · Diploma · Transcript"))).toEqual([]);
    expect(heuristicGrades(item("honors", "1st Place, Regional Competition — Issued by Northfield Music Clubs · Mar 2025"))).toEqual([]);
    expect(heuristicGrades(item("experience", "Intern — Northfield Realty — Present"))).toEqual([]);
    // The description after a record line's metadata is still read.
    const award = "Band Award — Issued by Northfield High School · May 2025 · Awarded to 2 students in recognition of musical excellence.";
    expect(heuristicGrades(item("honors", award)).map((c) => c.quote)).toEqual(["Awarded to 2 students in recognition of musical excellence"]);
  });

  it("treats years of training as sustained depth", () => {
    const [training] = heuristicGrades(item("about", "After 9 years of studying software development I build web apps"));
    expect(training!.grades.sustainedDepth).toBe(3);
  });

  it("never quotes an entry's title or organization, and quotes only exact text", () => {
    const text = "Team Captain — Webmaster Club — Captained a five-student team that won 2nd place";
    const grades = heuristicGrades(item("experience", text));
    expect(grades.length).toBeGreaterThan(0);
    for (const g of grades) {
      expect(text.includes(g.quote)).toBe(true);
      expect(g.quote).not.toBe("Team Captain");
    }
    expect(score({ ...grades[0]!, id: "x", itemKey: "x", itemOrder: 0, position: 0, itemLength: text.length })).toBeGreaterThan(30);
  });

  it("grades a placement above coursework", () => {
    const [placement] = heuristicGrades(item("honors", "Regional Conference — TSA — Won 2nd place in Webmaster"));
    const [course] = heuristicGrades(item("education", "Northfield High — Diploma — Took AP Computer Science and AP Calculus"));
    const asRank = (g: typeof placement) => ({ ...g!, id: "x", itemKey: "x", itemOrder: 0, position: 0, itemLength: 100 });
    expect(score(asRank(placement))).toBeGreaterThan(score(asRank(course)));
  });
});

describe("core admission", () => {
  it("keeps well-graded coursework out of the highlights when the profile has enough strong evidence", () => {
    const strong = [
      candidate("competition", "Won 1st place at the state hackathon"),
      candidate("shipped", "Shipped an app used by 2,000 students"),
      candidate("tutoring", "Tutored 15+ students over 150 hours"),
      candidate("costCut", "Cut ticket processing time by 40%"),
      candidate("selective", "Admitted to a 5% acceptance research program"),
    ];
    const course = candidate("coursework", "APCSP, APCSA, AP Cybersecurity", { section: "education", itemKey: "edu", goalRelevance: 3, grades: { ...NONE, technicalDepth: 2, specificity: 3, distinctiveness: 2 } });
    const ranking = rankSignals([...strong, course], { goalActive: true });
    expect([...ranking.core, ...ranking.discovery].map((c) => c.quote)).not.toContain(course.quote);
    expect(ranking.core.map((c) => c.quote).every((q) => strong.some((s) => s.quote === q))).toBe(true);
    expect(ranking.core.length).toBeGreaterThanOrEqual(4);
  });

  it("lets supporting evidence into the core of a sparse profile", () => {
    const course = candidate("coursework", "APCSP, APCSA, AP Cybersecurity", { section: "education", goalRelevance: 3, grades: { ...NONE, technicalDepth: 2, specificity: 3, distinctiveness: 2 } });
    const ranking = rankSignals([candidate("shipped", "Shipped an app used by 2,000 students"), course], { goalActive: true });
    expect(ranking.core.map((c) => c.quote)).toContain(course.quote);
  });
});

describe("density on short profiles", () => {
  it("keeps two strong facts from one short item instead of trimming it to one", () => {
    const shared = { itemKey: "research", itemLength: 220 };
    const ranking = rankSignals(
      [
        candidate("dashboard", "Analyzing real-time power outage data using AWS", { ...shared, position: 0 }),
        candidate("shipped", "enhance predictions of grid vulnerabilities caused by peak demand", { ...shared, position: 60 }),
      ],
      { goalActive: false },
    );
    expect([...ranking.core, ...ranking.discovery]).toHaveLength(2);
  });
});

describe("cross-section training duplicates", () => {
  it("keeps one statement of the same years of training", () => {
    const ranking = rankSignals(
      [
        candidate("training", "9 years of studying Software Development at IT STEP Academy", { section: "about" }),
        candidate("training", "Over 9 years, I acquired skills in Python, C++, C#", { section: "education" }),
        candidate("training", "2+ years of private piano instruction", { section: "experience" }),
      ],
      { goalActive: false },
    );
    const reasons = ranking.debug.filter((r) => r.reason === "DUPLICATE_FACT").map((r) => r.quote);
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatch(/9 years/);
  });
});

describe("Key Evidence lines", () => {
  it("keeps one line per entry, so one experience cannot fill the list", () => {
    const scholarship = ["Selected for the Brightway Merit Scholarship, awarded to 12 incoming students each year", "Brightway Merit Scholarship covers full tuition for four years"].map(
      (fact, i) => candidate("selective", `quote ${i} about the scholarship`, { itemKey: "award", section: "honors", position: i * 40, fact }),
    );
    const other = candidate("shipped", "Shipped an app used by 2,000 students", { itemKey: "app", fact: "Shipped a study-planner app used by 2,000 students at Northfield High" });
    const facts = rankSignals([...scholarship, other], { goalActive: false }).facts.map((f) => f.text);
    expect(facts.filter((f) => f.includes("Brightway"))).toHaveLength(1);
    expect(facts).toContain("Shipped a study-planner app used by 2,000 students at Northfield High");
  });

  it("lets About, which can tell several experiences, keep two lines", () => {
    const about = ["Founded Northwind Labs to build and launch original mobile apps", "Tutored 15 students in algebra every week at the Math Center", "Volunteered 80 hours at the Riverside food bank"].map(
      (fact, i) => candidate("shipped", `about quote ${i}`, { itemKey: "about", section: "about", position: i * 60, fact }),
    );
    expect(rankSignals(about, { goalActive: false }).facts).toHaveLength(2);
  });

  it("never lists a supporting clause as its own line", () => {
    const main = candidate("selective", "admitted into the Advanced track", { itemKey: "e", group: 1, claim: "main", fact: "Admitted at age 12 into the Advanced Engineering track meant for students 17 and older" });
    const support = candidate("selective", "a track meant for students 17 and older", { itemKey: "e", group: 1, claim: "support", position: 40, fact: "Track meant for students 17 and older" });
    expect(rankSignals([main, support], { goalActive: false }).facts.map((f) => f.text)).toEqual(["Admitted at age 12 into the Advanced Engineering track meant for students 17 and older"]);
  });
});

describe("fallback Key Evidence wording", () => {
  it("turns a complete first-person action into a line, and nothing else", () => {
    expect(fallbackEvidence("I built a booking dashboard used by 40 teachers")).toBe("Built a booking dashboard used by 40 teachers");
    expect(fallbackEvidence("Completed 60+ hours of tutoring in Java")).toBe("Completed 60+ hours of tutoring in Java");
    // Fragments without their subject or action get no line at all.
    expect(fallbackEvidence("awarded to 12 students annually")).toBeNull();
    expect(fallbackEvidence("for a 4,000+ student school")).toBeNull();
    expect(fallbackEvidence("Built my site")).toBeNull();
    expect(fallbackEvidence("Awarded to 2 students of approximately 400")).toBeNull();
  });
});

describe("Key Evidence and inline highlighting are two answers", () => {
  // A long yearbook entry: one strong fact, two concrete duties a skimmer needs, one filler clause.
  const YEARBOOK = "Designed and developed a yearbook website for a 4,000+ student school, providing centralized access to yearbook photos, pricing, and ordering information. Built a custom staff dashboard enabling the yearbook adviser to independently add, edit, and remove photos and student information across multiple website sections. Maintain the website throughout the school year, keeping content, ordering details, and announcements up to date. Worked closely with the team to support various goals.";
  const at = (quote: string) => YEARBOOK.indexOf(quote);
  const entry = (kind: keyof typeof KINDS, quote: string, extra: Partial<RankCandidate>) =>
    candidate(kind, quote, { itemKey: "yearbook", position: at(quote), itemLength: YEARBOOK.length, ...extra });
  const duty = { type: "responsibility" as const, grades: { ...NONE, ownership: 1, specificity: 2 }, readingValue: 2 };
  const yearbook = () => [
    entry("shipped", "Designed and developed a yearbook website for a 4,000+ student school", { readingValue: 3, fact: "Designed and developed a yearbook website serving a 4,000+ student school" }),
    entry("dashboard", "Built a custom staff dashboard", { readingValue: 3, grades: { ...NONE, ownership: 2, technicalDepth: 2, specificity: 2 }, fact: "Built a custom staff dashboard for the yearbook adviser to manage photos" }),
    entry("workshop", "Maintain the website throughout the school year", { ...duty, fact: "Maintains the yearbook website throughout the school year" }),
    entry("interested", "Worked closely with the team to support various goals", { readingValue: 0, fact: null }),
  ];
  const strongElsewhere = (n: number) =>
    Array.from({ length: n }, (_, i) => candidate(i % 2 ? "competition" : "costCut", `Strong fact number ${i} with 1${i}0 people`, { fact: `Strong fact number ${i} reached 1${i}0 people at Northfield`, readingValue: 3 }));
  const inlineQuotes = (ranking: ReturnType<typeof rankSignals>) => [...ranking.core, ...ranking.discovery, ...ranking.reading].map((c) => c.quote);

  it("highlights a concrete duty for skimming without making it Key Evidence", () => {
    const ranking = rankSignals([...yearbook(), ...strongElsewhere(4)], { goalActive: false });
    expect(inlineQuotes(ranking)).toContain("Maintain the website throughout the school year");
    expect(ranking.facts.map((f) => f.text)).not.toContain("Maintains the yearbook website throughout the school year");
  });

  it("lets the strongest fact be both highlighted and Key Evidence", () => {
    const ranking = rankSignals([...yearbook(), ...strongElsewhere(2)], { goalActive: false });
    expect(inlineQuotes(ranking)).toContain("Designed and developed a yearbook website for a 4,000+ student school");
    expect(ranking.facts.map((f) => f.text)).toContain("Designed and developed a yearbook website serving a 4,000+ student school");
  });

  it("gives a long description enough highlights to skim, but never its filler", () => {
    const ranking = rankSignals(yearbook(), { goalActive: false });
    expect(inlineQuotes(ranking)).toEqual(expect.arrayContaining(["Designed and developed a yearbook website for a 4,000+ student school", "Built a custom staff dashboard", "Maintain the website throughout the school year"]));
    expect(inlineQuotes(ranking)).not.toContain("Worked closely with the team to support various goals");
    expect(ranking.debug.find((d) => d.quote.startsWith("Worked closely"))!.inline).toBe(false);
  });

  it("still highlights a useful phrase in its entry when the profile has many stronger facts", () => {
    const ranking = rankSignals([...yearbook(), ...strongElsewhere(30)], { goalActive: false });
    expect(inlineQuotes(ranking)).toContain("Maintain the website throughout the school year");
  });

  it("lists only strong facts once a profile has enough of them, from any section", () => {
    const useful = candidate("mentored", "Mentored 3 new club members", { fact: "Mentored 3 new club members in the Northfield robotics club", grades: { ...NONE, leadership: 1, specificity: 2, ownership: 1 }, readingValue: 2 });
    const award = candidate("competition", "Won 1st place at the State Science Fair", { section: "honors", fact: "Won 1st place at the North Carolina State Science Fair in engineering" });
    const ranking = rankSignals([useful, award, ...strongElsewhere(4)], { goalActive: false });
    const texts = ranking.facts.map((f) => f.text);
    expect(texts).toContain("Won 1st place at the North Carolina State Science Fair in engineering");
    expect(texts).not.toContain("Mentored 3 new club members in the Northfield robotics club");
    expect(ranking.debug.find((d) => d.quote === "Mentored 3 new club members")!.keyReason).toBe("LOW_KEY_EVIDENCE_VALUE");
  });

  it("merges an admission and the clause that makes it unusual into one line, but highlights both", () => {
    const text = "At age 13, I was admitted into Senior Software Development program (a program intended for students aged 18 and older) because of my first-place ranking.";
    const shared = { itemKey: "step", section: "education" as const, itemLength: text.length, group: 1 };
    const main = candidate("selective", "At age 13, I was admitted into Senior Software Development program", { ...shared, claim: "main", readingValue: 3, fact: "Admitted at age 13 to the Senior Software Development program, intended for students 18 and older" });
    const support = candidate("selective", "a program intended for students aged 18 and older", { ...shared, position: text.indexOf("a program intended"), claim: "support", readingValue: 2, fact: null });
    const ranking = rankSignals([main, support], { goalActive: false });
    expect(ranking.facts.map((f) => f.text)).toEqual(["Admitted at age 13 to the Senior Software Development program, intended for students 18 and older"]);
    expect(inlineQuotes(ranking)).toEqual(expect.arrayContaining([main.quote, support.quote]));
  });

  it("separates strong, useful, and generic claims: A and B listed, A to D highlighted, E neither", () => {
    const routine = { readingValue: 2, type: "responsibility" as const, grades: { ...NONE, ownership: 1, specificity: 2 } };
    const item = (kind: keyof typeof KINDS, quote: string, i: number, extra: Partial<RankCandidate>) => candidate(kind, quote, { itemKey: "job", itemLength: 900, position: i * 120, ...extra });
    const claims = [
      item("costCut", "Cut onboarding time by 40% for 2,000 users", 0, { itemKey: "portal", readingValue: 3, fact: "Cut onboarding time by 40% for 2,000 users of the Northwind portal" }),
      item("competition", "Won 1st place in the regional hackathon", 1, { itemKey: "hackathon", section: "honors", readingValue: 3, fact: "Won 1st place in the Northwind regional hackathon" }),
      item("workshop", "Wrote the API documentation", 2, { ...routine, fact: "Wrote the API documentation for the portal" }),
      item("workshop", "Ran weekly releases", 3, { ...routine, fact: "Ran weekly releases of the portal" }),
      item("interested", "Collaborated effectively across teams", 4, { readingValue: 0, fact: null }),
    ];
    const ranking = rankSignals(claims, { goalActive: false });
    const texts = ranking.facts.map((f) => f.text);
    expect(texts).toEqual(expect.arrayContaining(["Cut onboarding time by 40% for 2,000 users of the Northwind portal", "Won 1st place in the Northwind regional hackathon"]));
    expect(texts).not.toContain("Ran weekly releases of the portal");
    expect(inlineQuotes(ranking)).toEqual(expect.arrayContaining(claims.slice(0, 4).map((c) => c.quote)));
    expect(inlineQuotes(ranking)).not.toContain("Collaborated effectively across teams");
  });

  it("leaves a weak course list or membership unhighlighted even when it reads easily", () => {
    const courses = candidate("coursework", "APCSP, APCSA, AP Statistics", { section: "education", readingValue: 2, grades: { ...NONE, specificity: 2 } });
    const club = candidate("participated", "Robotics Club (11th)", { section: "education", readingValue: 2 });
    const ranking = rankSignals([courses, club], { goalActive: false });
    expect(ranking.reading).toEqual([]);
  });

  it("adds a supporting clause whose number the line left out, in the clause's own words", () => {
    const shared = { itemKey: "step", section: "education" as const, itemLength: 300, group: 1 };
    const main = candidate("selective", "admitted into the Advanced Engineering track", { ...shared, claim: "main", fact: "Admitted at age 12 to the Advanced Engineering track at Northfield Coding School" });
    const support = candidate("selective", "a track intended for students aged 17 and older", { ...shared, claim: "support", position: 60, fact: null });
    expect(rankSignals([main, support], { goalActive: false }).facts.map((f) => f.text)).toEqual([
      "Admitted at age 12 to the Advanced Engineering track at Northfield Coding School; a track intended for students aged 17 and older",
    ]);
    const folded = { ...main, fact: "Admitted at age 12 to the Advanced Engineering track, intended for students aged 17 and older" };
    expect(rankSignals([folded, support], { goalActive: false }).facts.map((f) => f.text)).toEqual([folded.fact]);
  });

  it("keeps a top fact in Key Evidence in its own words when its written line was rejected", () => {
    const placement = candidate("competition", "Earned 2nd place at the TSA Regional Conference", { section: "honors", fact: null });
    const vague = candidate("competition", "the regional conference", { section: "honors", fact: null });
    const ranking = rankSignals([placement, vague], { goalActive: false });
    expect(ranking.facts.map((f) => f.text)).toEqual(["Earned 2nd place at the TSA Regional Conference"]);
  });

  it("focuses a yappy sentence on its concrete parts", () => {
    const filler = { type: "other" as const, grades: { ...NONE, genericness: 3, specificity: 0 }, readingValue: 0 };
    const claims = [
      candidate("shipped", "creation and eventual deployment of a customer-facing analytics dashboard", { itemKey: "yap", position: 90, group: 0, readingValue: 3, fact: "Contributed to deploying a customer-facing analytics dashboard used by about 2,000 users" }),
      candidate("costCut", "helped approximately 2,000 users monitor their accounts", { itemKey: "yap", position: 180, group: 0, claim: "support", readingValue: 3, fact: null }),
      candidate("interested", "Worked collaboratively with multiple stakeholders", { itemKey: "yap", position: 0, group: 1, ...filler }),
      candidate("interested", "strategically facilitate innovative efforts", { itemKey: "yap", position: 50, group: 2, ...filler }),
    ];
    const ranking = rankSignals(claims, { goalActive: false });
    expect(inlineQuotes(ranking)).toEqual(expect.arrayContaining(["creation and eventual deployment of a customer-facing analytics dashboard", "helped approximately 2,000 users monitor their accounts"]));
    expect(inlineQuotes(ranking)).not.toContain("Worked collaboratively with multiple stakeholders");
    expect(inlineQuotes(ranking)).not.toContain("strategically facilitate innovative efforts");
  });
});

describe("reading value", () => {
  it("derives reading value for grades that carry none, and keeps filler low", () => {
    expect(readingGrade({ grades: { ...NONE, ownership: 3, specificity: 3 } })).toBe(3);
    expect(readingGrade({ grades: { ...NONE, specificity: 0, genericness: 3 } })).toBe(0);
    expect(readingGrade({ readingValue: 1, grades: { ...NONE, ownership: 3, specificity: 3 } })).toBe(1);
  });

  it("rates a concrete duty above filler even when neither is important", () => {
    expect(readingScore({ readingValue: 2, type: "responsibility", grades: { ...NONE, specificity: 2 } }, 5)).toBeGreaterThanOrEqual(READING_FLOOR);
    expect(readingScore({ readingValue: 0, type: "self_description", grades: { ...NONE, genericness: 3 } }, 5)).toBeLessThan(READING_FLOOR);
  });
});

describe("Key Evidence from one long entry", () => {
  it("lists a second exceptional event from a long entry, but never a second line about the same event", () => {
    const exceptional = { ...NONE, ...KINDS.tutoring.grades, distinctiveness: 3, impact: 3, sustainedDepth: 3 };
    const tutoring = (quote: string, group: number, fact: string) => candidate("tutoring", quote, { itemKey: "tutor", itemLength: 700, group, claim: "main", position: group * 100, fact, grades: exceptional });
    const ranking = rankSignals(
      [
        tutoring("Completed 150+ hours of tutoring in Python", 1, "Completed 150+ hours of Python tutoring for 15+ peers at Northfield High"),
        tutoring("Progressed from student to tutor over 2 years", 2, "Progressed from programming student to volunteer tutor over 2 years"),
        tutoring("Tutored 15+ students in Python every week", 1, "Tutored 15+ students in Python every week at Northfield High"),
      ],
      { goalActive: false },
    );
    expect(ranking.facts.map((f) => f.text)).toEqual(["Completed 150+ hours of Python tutoring for 15+ peers at Northfield High", "Progressed from programming student to volunteer tutor over 2 years"]);
  });
});

describe("Key Evidence judges a claim with its group", () => {
  it("prefers the entry's claim whose supporting clause carries the scale", () => {
    const shared = { itemKey: "yearbook", itemLength: 500 };
    const website = candidate("workshop", "Designed and developed a yearbook website", { ...shared, group: 1, claim: "main", grades: { ...NONE, ownership: 3, technicalDepth: 2, specificity: 2, distinctiveness: 2 }, fact: "Designed and developed a yearbook website serving a 4,000+ student school" });
    const scale = candidate("costCut", "for a 4,000+ student school", { ...shared, group: 1, claim: "support", position: 45, fact: null });
    const dashboard = candidate("dashboard", "Built a custom staff dashboard", { ...shared, group: 2, claim: "main", position: 150, fact: "Built a custom staff dashboard for the yearbook adviser" });
    const ranking = rankSignals([website, scale, dashboard], { goalActive: false });
    expect(ranking.facts.map((f) => f.text)[0]).toBe("Designed and developed a yearbook website serving a 4,000+ student school");
  });
});

describe("Key Evidence for an award", () => {
  it("lists an award once, even when its description holds another exceptional claim", () => {
    const shared = { itemKey: "tsa", section: "honors" as const, itemLength: 600, claim: "main" as const };
    const placement = candidate("competition", "Earned 2nd place at the regional conference", { ...shared, group: 1, fact: "Earned 2nd place at the Northfield regional conference as team captain" });
    const led = candidate("competition", "Led the website's full-stack development", { ...shared, group: 2, position: 80, fact: "Led full-stack development of the second-place Northfield conference website" });
    expect(rankSignals([placement, led], { goalActive: false }).facts).toHaveLength(1);
  });
});
