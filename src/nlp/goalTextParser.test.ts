import { describe, expect, it } from "vitest";
import { condenseForGoalText, GOAL_TEXT_MAX_LENGTH, parseGoalDraftFromText } from "./goalTextParser";

function labelsFor(importance: string, criteria: { label: string; importance: string }[]): string[] {
  return criteria.filter((c) => c.importance === importance).map((c) => c.label.toLowerCase());
}

describe("parseGoalDraftFromText - the mission's own example", () => {
  const draft = parseGoalDraftFromText(
    "I am looking for FRC mentors in Charlotte with mechanical or aerospace engineering experience who could advise our robotics team.",
  );

  it("derives a sensible goal name from the core subject phrase", () => {
    expect(draft.name.toLowerCase()).toContain("frc mentor");
  });

  it("extracts 'FRC mentor' as a Must Have criterion", () => {
    expect(labelsFor("MUST_HAVE", draft.criteria)).toContain("frc mentor");
  });

  it("extracts the location as a Preferred criterion", () => {
    expect(labelsFor("PREFERRED", draft.criteria).some((l) => l.includes("charlotte"))).toBe(true);
  });

  it("expands the 'mechanical or aerospace engineering' alternatives into two separate criteria", () => {
    const preferred = labelsFor("PREFERRED", draft.criteria);
    expect(preferred).toContain("mechanical engineering");
    expect(preferred).toContain("aerospace engineering");
  });

  it("picks up 'robotics' as a lower-confidence Optional context signal", () => {
    expect(labelsFor("OPTIONAL", draft.criteria)).toContain("robotics");
  });

  it("never invents a criterion that isn't traceable to the actual input text", () => {
    for (const criterion of draft.criteria) {
      const normalized = criterion.label.toLowerCase();
      const words = normalized.split(" ");
      // Every word in every generated criterion must appear somewhere in the source text.
      for (const word of words) {
        expect(
          "i am looking for frc mentors in charlotte with mechanical or aerospace engineering experience who could advise our robotics team.".includes(
            word,
          ),
        ).toBe(true);
      }
    }
  });
});

describe("parseGoalDraftFromText - organization membership and language ability", () => {
  it("extracts a capitalized acronym plus 'member(s)' as a membership criterion (observed live: 'TSA Members with Multilingual Development Skills' returned zero criteria before this pattern existed)", () => {
    const draft = parseGoalDraftFromText("TSA Members with Multilingual Development Skills");
    const preferred = labelsFor("PREFERRED", draft.criteria);
    expect(preferred).toContain("tsa member");
  });

  it("extracts plain-language multilingual ability from 'Multilingual' as its own criterion", () => {
    const draft = parseGoalDraftFromText("TSA Members with Multilingual Development Skills");
    const preferred = labelsFor("PREFERRED", draft.criteria);
    expect(preferred).toContain("multilingual");
  });

  it("extracts a lowercase 'X association' phrase as a membership criterion, without requiring title case", () => {
    const draft = parseGoalDraftFromText("Technology student association, speak several languages");
    const preferred = labelsFor("PREFERRED", draft.criteria);
    expect(preferred.some((l) => l.includes("technology student association"))).toBe(true);
  });

  it("extracts 'speak several languages' as multilingual ability, not just a bare 'languages' keyword", () => {
    const draft = parseGoalDraftFromText("Technology student association, speak several languages");
    const preferred = labelsFor("PREFERRED", draft.criteria);
    expect(preferred).toContain("multilingual");
  });

  it("never returns zero criteria for either of these previously-broken real descriptions", () => {
    expect(parseGoalDraftFromText("TSA Members with Multilingual Development Skills").criteria.length).toBeGreaterThan(0);
    expect(parseGoalDraftFromText("Technology student association, speak several languages").criteria.length).toBeGreaterThan(0);
  });

  it("still recognizes a plain 'bilingual'/'trilingual' claim", () => {
    expect(labelsFor("PREFERRED", parseGoalDraftFromText("Fluent in multiple languages, bilingual preferred.").criteria)).toContain(
      "multilingual",
    );
  });

  it("still leaves genuinely unrecognized nonsense text empty, this isn't a catch-all", () => {
    const draft = parseGoalDraftFromText("Blorptastic wobble ferns under a purple moon.");
    expect(draft.criteria).toEqual([]);
  });
});

describe("parseGoalDraftFromText - exclusions", () => {
  it("extracts an exclusion phrase as an Excluded criterion, not a positive one", () => {
    const draft = parseGoalDraftFromText("Looking for software engineers, not recruiters, in Austin.");
    expect(labelsFor("EXCLUDED", draft.criteria).some((l) => l.includes("recruiter"))).toBe(true);
    expect(draft.criteria.every((c) => c.importance === "EXCLUDED" || !c.label.toLowerCase().includes("recruiter"))).toBe(
      true,
    );
  });
});

describe("parseGoalDraftFromText - length handling", () => {
  it("enforces the 1000-character maximum internally as a safety net", () => {
    const long = "looking for engineers ".repeat(100);
    expect(long.length).toBeGreaterThan(GOAL_TEXT_MAX_LENGTH);
    const draft = parseGoalDraftFromText(long);
    expect(draft.name.length).toBeLessThanOrEqual(GOAL_TEXT_MAX_LENGTH);
  });

  it("returns an empty draft for empty input", () => {
    const draft = parseGoalDraftFromText("");
    expect(draft.name).toBe("");
    expect(draft.criteria).toEqual([]);
  });
});

describe("parseGoalDraftFromText - fallback name when no subject pattern matches", () => {
  it("never falls back to a truncated copy of the raw sentence", () => {
    const draft = parseGoalDraftFromText("Software/computer science skills, being able to create projects");
    expect(draft.name).not.toContain("...");
    expect(draft.name.length).toBeLessThan(60);
  });

  it("derives a short readable name from the first clause", () => {
    const draft = parseGoalDraftFromText("technology student association, speak several languages");
    expect(draft.name).toBe("Technology Student Association");
  });

  it("still derives a short name with no comma in the input at all", () => {
    const draft = parseGoalDraftFromText("student interested in cybersecurity who has leadership experience");
    expect(draft.name.length).toBeGreaterThan(0);
    expect(draft.name.split(" ").length).toBeLessThanOrEqual(6);
  });
});

describe("parseGoalDraftFromText - determinism", () => {
  it("produces identical output across repeated calls with the same input", () => {
    const text = "Seeking AI collaborators with machine learning experience, not students.";
    const first = parseGoalDraftFromText(text);
    const second = parseGoalDraftFromText(text);
    expect(second).toEqual(first);
  });
});

describe("condenseForGoalText - long-document handling", () => {
  it("returns text unchanged when already under the limit", () => {
    expect(condenseForGoalText("Looking for FRC mentors.")).toBe("Looking for FRC mentors.");
  });

  it("prefers goal-relevant sentences over unrelated filler, rather than truncating the beginning blindly", () => {
    const filler = "This is an unrelated paragraph about lunch plans and the weather forecast for next week. ".repeat(
      15,
    );
    const relevant =
      "We are looking for FRC mentors with mechanical engineering experience to advise our robotics team.";
    const document = filler + relevant + " " + filler;
    expect(document.length).toBeGreaterThan(GOAL_TEXT_MAX_LENGTH);

    const condensed = condenseForGoalText(document);
    expect(condensed.length).toBeLessThanOrEqual(GOAL_TEXT_MAX_LENGTH);
    // The relevant sentence must survive even buried in the middle, proof this isn't a blind
    // "keep the first N characters" truncation.
    expect(condensed.toLowerCase()).toContain("frc mentors");
  });

  it("falls back to document order when nothing scores as goal-relevant, rather than returning nothing", () => {
    const document = "Lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(30);
    expect(document.length).toBeGreaterThan(GOAL_TEXT_MAX_LENGTH);
    const condensed = condenseForGoalText(document);
    expect(condensed.length).toBeGreaterThan(0);
    expect(condensed.length).toBeLessThanOrEqual(GOAL_TEXT_MAX_LENGTH);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const document = "Looking for AI collaborators with machine learning experience. ".repeat(50);
    const first = condenseForGoalText(document);
    const second = condenseForGoalText(document);
    expect(second).toBe(first);
  });
});

describe("parseGoalDraftFromText - never claims full understanding", () => {
  it("leaves unrecognized free text out of the draft rather than guessing", () => {
    const draft = parseGoalDraftFromText("Blorptastic wobble ferns under a purple moon.");
    // Nothing here matches any known pattern or vocabulary, an empty draft is correct here,
    // not a fabricated guess.
    expect(draft.criteria).toEqual([]);
  });
});
