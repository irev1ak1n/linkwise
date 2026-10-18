import { describe, expect, it } from "vitest";
import { bandFor, rankSignals, scoreCandidate, type RankCandidate } from "./signalRanking";
import { heuristicGrades } from "./heuristicGrades";
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
    const dense = facts.map((q, i) => candidate("shipped", q, { itemKey: "dense", position: i * 40 }));
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
