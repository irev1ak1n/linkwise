import { describe, expect, it } from "vitest";
import { findBenefits, findRestrictions, parseCompensation, parseHeader, readPostingFacts, sectionLists } from "./jobFacts";
import type { JobPosting } from "./jobTypes";

const posting = (over: Partial<JobPosting>): JobPosting => ({ jobId: "1", url: "", title: "", company: "", headerLines: [], description: "", companyText: "", ...over });

// Four different kinds of posting, written in different shapes, so nothing depends on one layout.
const INTERN = posting({
  title: "Technology Development Program (Intern)",
  headerLines: ["Acme Bank", "Technology Development Program", "Pittsburgh, PA · 2 days ago · Over 100 people clicked apply", "Hybrid", "Internship"],
  description: `Pay range: $28/hr - $31/hr. This is a 24-month rotational program starting June 2027.

Responsibilities
• Develop internal software tools
• Work with senior technology leaders
• Test and debug applications

Minimum Qualifications
• Currently pursuing a CS or related degree
• Experience developing applications using Python or another object-oriented language
• Must be authorized to work in the United States

Preferred Qualifications
• Previous internship experience
• AWS knowledge

Benefits
We offer health insurance, a 401(k) match and tuition assistance.`,
});
const SENIOR = posting({
  title: "Senior Backend Engineer",
  headerLines: ["Remote", "Austin, TX · 1 week ago", "Full-time", "Mid-Senior level"],
  description: `About the team. We build payments software.

What you'll do
- Design and ship services in Go and PostgreSQL
- Lead code reviews

What you bring
- 5+ years of backend experience
- Strong communication skills
- Nice to have: Kubernetes

The base salary range is $150,000 - $185,000 per year, plus equity and an annual bonus. This role requires 10% travel and is open to U.S. citizens and permanent residents only. We do not offer visa sponsorship.`,
});
const NON_TECH = posting({
  title: "Store Associate",
  headerLines: ["Denver, CO (On-site)", "Part-time"],
  description: `Join our team! Pay: $17.50 to $19 per hour. You must be at least 18 years old, able to lift 40 lbs, and available nights and weekends. Employee discount and paid time off included.`,
});
const NO_PAY = posting({ title: "Analyst", headerLines: ["Boston, MA · 3 weeks ago", "Full-time"], description: "We are hiring an analyst.\n\nRequirements\n- Bachelor's degree\n- Excel skills" });

describe("compensation", () => {
  it("reads hourly and yearly ranges in the shapes postings use", () => {
    expect(parseCompensation("Pay range: $28/hr - $31/hr.")).toMatchObject({ min: 28, max: 31, currency: "USD", period: "hour", rawText: "Pay range: $28/hr - $31/hr." });
    expect(parseCompensation("The base salary range is $150,000 - $185,000 per year, plus equity.")).toMatchObject({ min: 150000, max: 185000, period: "year" });
    expect(parseCompensation("Pay: $17.50 to $19 per hour.")).toMatchObject({ min: 17.5, max: 19, period: "hour" });
    expect(parseCompensation("Salary: $65K-$85K")).toMatchObject({ min: 65000, max: 85000 });
  });

  it("says nothing when the posting names no pay, and does not mistake other money for salary", () => {
    expect(parseCompensation("We are hiring an analyst. Great culture.")).toBeNull();
    const bonusOnly = parseCompensation("Eligible for a $5,000 sign-on bonus.");
    expect(bonusOnly).toMatchObject({ min: null, rawText: "" });
    expect(bonusOnly!.other[0]!.evidence).toContain("sign-on bonus");
    expect(parseCompensation("Annual bonus. Base pay $90,000 per year.")).toMatchObject({ min: 90000, period: "year" });
  });
});

describe("header", () => {
  it("reads location, workplace, employment, level, posted date, and applicants from the top card", () => {
    expect(parseHeader(INTERN.headerLines, INTERN.title, INTERN.description)).toEqual({ location: "Pittsburgh, PA", workplaceType: "hybrid", employmentType: "Internship", experienceLevel: null, postedDate: "2 days ago", applicants: "Over 100 people clicked apply" });
    expect(parseHeader(SENIOR.headerLines, SENIOR.title, SENIOR.description)).toMatchObject({ workplaceType: "remote", employmentType: "Full-time", experienceLevel: "Mid-Senior level", location: "Austin, TX" });
    expect(parseHeader(NON_TECH.headerLines, NON_TECH.title, NON_TECH.description)).toMatchObject({ location: "Denver, CO", workplaceType: "on-site", employmentType: "Part-time" });
  });

  it("leaves workplace unknown when nothing says it", () => {
    expect(parseHeader(NO_PAY.headerLines, NO_PAY.title, NO_PAY.description).workplaceType).toBeNull();
  });
});

describe("restrictions and benefits", () => {
  it("flags what can rule someone in or out, each with the sentence it came from", () => {
    const labels = (text: string) => findRestrictions(text).map((r) => r.text);
    expect(labels(INTERN.description)).toEqual(expect.arrayContaining(["Work authorization", "Enrollment"]));
    expect(labels(SENIOR.description)).toEqual(expect.arrayContaining(["Citizenship", "Sponsorship", "Travel"]));
    expect(labels(NON_TECH.description)).toEqual(expect.arrayContaining(["Age requirement", "Physical requirements", "Schedule"]));
    expect(findRestrictions("This is an unpaid internship.")[0]).toMatchObject({ text: "Unpaid", evidence: "This is an unpaid internship." });
    expect(labels(NO_PAY.description)).toEqual([]);
  });

  it("lists only benefits the posting states", () => {
    expect(findBenefits(INTERN.description).map((b) => b.text)).toEqual(expect.arrayContaining(["Health insurance", "401(k)", "Tuition assistance"]));
    expect(findBenefits(NON_TECH.description).map((b) => b.text)).toEqual(expect.arrayContaining(["Employee discounts", "Paid time off"]));
    expect(findBenefits(NO_PAY.description)).toEqual([]);
    expect(findBenefits("This is an unpaid position with no benefits.")).toEqual([]);
  });
});

describe("sections and skills", () => {
  it("separates required from preferred, and responsibilities from both", () => {
    const lists = sectionLists(INTERN.description);
    expect(lists.responsibilities.map((r) => r.text)).toEqual(["Develop internal software tools", "Work with senior technology leaders", "Test and debug applications"]);
    expect(lists.required.map((r) => r.text)).toContain("Currently pursuing a CS or related degree");
    expect(lists.required.map((r) => r.text)).not.toContain("Previous internship experience");
    expect(lists.preferred.map((r) => r.text)).toEqual(["Previous internship experience", "AWS knowledge"]);
  });

  it("finds real skills with their sentence, and ignores filler", () => {
    const facts = readPostingFacts(SENIOR);
    expect(facts.technical.map((s) => s.text)).toEqual(expect.arrayContaining(["Go", "SQL", "Kubernetes"]));
    expect(facts.professional.map((s) => s.text)).toContain("Communication");
    expect(readPostingFacts(NON_TECH).technical).toEqual([]);
  });

  it("reads a company section's industry and size as LinkedIn states them", () => {
    const facts = readPostingFacts(posting({ companyText: "Meta\n12,371,684 followers\nSoftware Development\n10001+ employees\n60,430 on LinkedIn\nMeta's mission is to build the future." }));
    expect(facts.company).toMatchObject({ industry: "Software Development", size: "10001+ employees", followers: "12,371,684 followers" });
  });
});
