import { describe, expect, it } from "vitest";
import { wordingProblems } from "./keyEvidenceWording";

const ITEM = "Brightway Merit Scholarship — Northfield University — Awarded to 12 students annually from the incoming class. Covers full tuition for four years.";
const ok = (text: string, quote: string, item = ITEM) => expect(wordingProblems(text, quote, item)).toEqual([]);
const bad = (text: string, quote: string, problem: string, item = ITEM) => expect(wordingProblems(text, quote, item)).toContain(problem);

describe("wordingProblems", () => {
  it("accepts a self-contained line that names what the fragment was about", () => {
    ok("Selected for the Brightway Merit Scholarship, awarded to 12 incoming students annually at Northfield University", "Awarded to 12 students annually from the incoming class");
    ok("Brightway Merit Scholarship covers full tuition for four years", "Covers full tuition for four years");
  });

  it("accepts a naturally complete short fact without padding", () => {
    ok("Earned the Microsoft Excel Associate certification", "Microsoft Excel Associate", "Microsoft Excel Associate — Microsoft — Issued 2024");
  });

  it("rejects a contextless fragment, but not the same opening with its entity named", () => {
    bad("Awarded to 12 students annually", "Awarded to 12 students annually from the incoming class", "contextless");
    bad("Covers full tuition for four years", "Covers full tuition for four years", "contextless");
    expect(wordingProblems("Covers full tuition for four years through the Brightway Merit Scholarship", "Covers full tuition", ITEM)).not.toContain("contextless");
  });

  it("rejects first person, empty lead-ins, and praise the item never states", () => {
    const item = "Founder — Northwind Labs — I founded Northwind Labs to build and launch apps.";
    bad("I founded Northwind Labs to build apps", "I founded Northwind Labs to build apps", "first_person", item);
    bad("The profile shows he founded Northwind Labs", "I founded Northwind Labs", "empty_lead_in", item);
    bad("Founded the prestigious Northwind Labs to build apps", "I founded Northwind Labs", "unsupported_adjective", item);
    ok("Founded Northwind Labs to build and launch original apps", "I founded Northwind Labs to build apps", item);
  });

  it("never lets a line claim more ownership than the item states", () => {
    const item = "Prom Committee — Contributed to selling 250 event tickets through the prom website.";
    // "Sold" drops the person's real credit, whichever rule names it.
    bad("Sold 250 event tickets through the prom website", "Contributed to selling 250 event tickets", "lost_qualifier", item);
    bad("Led the prom website that sold 250 event tickets", "Contributed to selling 250 event tickets", "inflated_ownership", item);
    ok("Contributed to selling 250 event tickets through the school prom website", "Contributed to selling 250 event tickets", item);
  });

  it("keeps qualifiers and plus signs", () => {
    const item = "Piano — Selected as 1 of ~30 pianists globally for the Summit Festival. Reached 500+ listeners.";
    bad("Selected as 1 of 30 pianists worldwide for the Summit Festival", "Selected as 1 of ~30 pianists globally", "lost_qualifier", item);
    ok("Selected as 1 of about 30 pianists worldwide for the Summit Festival", "Selected as 1 of ~30 pianists globally", item);
    bad("Performed for 500 listeners at the Summit Festival", "Reached 500+ listeners", "lost_plus", item);
    ok("Reached 500+ listeners through performances at the Summit Festival", "Reached 500+ listeners", item);
  });

  it("does not mistake an ordinary 'about' for a numeric qualifier", () => {
    const item = "Tutor — Math Center — Taught students about algebra and geometry.";
    ok("Taught students algebra and geometry at the Math Center", "Taught students about algebra and geometry", item);
  });

  it("allows a long line only up to the limit", () => {
    const long = Array.from({ length: 33 }, () => "word").join(" ");
    bad(long, "word", "too_long");
  });
});
