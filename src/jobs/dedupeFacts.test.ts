import { describe, expect, it } from "vitest";
import { dedupeAcross, isSameFact } from "./dedupeFacts";

const f = (text: string) => ({ text, evidence: text });

describe("same fact", () => {
  it("catches the same pay, place, and requirement worded differently", () => {
    expect(isSameFact("Pays $60,000–$96,600/year.", "The annual salary range for this role is $60,000–$96,600.")).toBe(true);
    expect(isSameFact("Pays $25.4–$29/hour.", "The hourly rate is estimated to be $25.40 to $29.00 per hour.")).toBe(true);
    expect(isSameFact("Hybrid in Pittsburgh, PA.", "This is a hybrid role based in Pittsburgh, PA, with part of the week in the office.")).toBe(true);
    expect(isSameFact("Must be authorized to work in the United States.", "Applicants need authorization to work in the United States without sponsorship.")).toBe(true);
  });

  it("keeps different facts apart", () => {
    expect(isSameFact("Pays $28–$31/hour.", "You would rotate across three technology teams over 24 months.")).toBe(false);
    expect(isSameFact("Requires 5 years of backend experience.", "Pays $150,000–$185,000/year.")).toBe(false);
  });
});

describe("dedupe across lists", () => {
  it("shows each fact once, in the first list that has it, keeping the fuller wording", () => {
    const [conditions, evidence] = dedupeAcross(
      [
        [f("Pays $60,000–$96,600/year."), f("The annual salary range is $60,000–$96,600, depending on location and experience.")],
        [f("You would build internal APIs with senior engineers."), f("Salary ranges from $60,000 to $96,600 a year.")],
      ],
      [10, 8],
    );
    expect(conditions!.map((c) => c.text)).toEqual(["The annual salary range is $60,000–$96,600, depending on location and experience."]);
    expect(evidence!.map((e) => e.text)).toEqual(["You would build internal APIs with senior engineers."]);
  });
});
