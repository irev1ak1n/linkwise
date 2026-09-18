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
    // The relevant sentence must survive even though it's buried in the middle, not at the
    // start — proof this isn't a blind "keep the first N characters" truncation.
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

describe("parseGoalDraftFromText - last-resort fallback for text no specific pattern recognizes", () => {
  it("still produces at least one criterion from the raw text itself, rather than returning nothing", () => {
    // This parser is the guaranteed local fallback `generateCriteria()` falls back to whenever
    // AI is unavailable or returns nothing (see ai/generateCriteria.ts) — and, since
    // goalStore.ts's `ensureActiveGoalCriteria` can feed it a goal's own short, title-like NAME
    // rather than a full "looking for X" sentence, it must never come back empty for reasonable
    // non-empty input; an empty result here made that fallback unreliable exactly when the
    // (non-deterministic) AI path was the one failing. Nothing here matches any of the more
    // specific patterns/vocabulary above, so the whole phrase itself becomes one PREFERRED
    // criterion — an honest "this is literally what was typed," never a fabricated guess at
    // meaning it doesn't have.
    const draft = parseGoalDraftFromText("Blorptastic wobble ferns under a purple moon.");
    expect(draft.criteria.length).toBeGreaterThan(0);
    expect(draft.criteria[0].importance).toBe("PREFERRED");
  });

  it("splits on commas/'and' when present, rather than treating the whole phrase as one criterion", () => {
    const draft = parseGoalDraftFromText("Multilingual, TSA-related contacts");
    expect(draft.criteria.map((c) => c.label)).toEqual(["Multilingual", "TSA-related contacts"]);
  });

  it("reproduces the exact live-reported case: a short goal title with no 'looking for' framing", () => {
    const draft = parseGoalDraftFromText("Multilingual TSA-Related Contacts");
    expect(draft.criteria.length).toBeGreaterThan(0);
  });

  it("never overrides criteria already found by the more specific patterns above", () => {
    const draft = parseGoalDraftFromText("Looking for FRC mentors.");
    // The subject pattern already found a real criterion — the last-resort fallback must not
    // also add the raw leftover text as a second, redundant one.
    expect(draft.criteria).toHaveLength(1);
    expect(draft.criteria[0].label.toLowerCase()).toContain("frc mentor");
  });
});
