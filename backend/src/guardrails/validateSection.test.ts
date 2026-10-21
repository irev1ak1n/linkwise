import { describe, expect, it } from "vitest";
import { isGroundedHeadline, isKeywordList, similarity, validateAboutOptions, validateHeadlineOptions, validateSectionAnalysis } from "./validateSection";
import type { AboutGenerationRequest, HeadlineGenerationRequest, SectionAnalysisRequest } from "../validation/sectionRequestSchema";

const profile = {
  identity: "me",
  evidence: [
    { id: "headline:0", section: "headline" as const, text: "Aspiring Software Engineer | Senior @ Westfield High", evidenceType: "headline" },
    { id: "education:0", section: "education" as const, text: "Code Academy — Skills in Python, C++, web development, robotics", evidenceType: "education" },
    { id: "experience:0", section: "experience" as const, text: "Website Developer — Robotics Club — Built a site used by 300+ students", evidenceType: "experience" },
  ],
};

const sectionRequest = (present = true): SectionAnalysisRequest => ({ profile, section: "banner", present, userContext: "" });

const generation: HeadlineGenerationRequest = {
  profile,
  currentHeadline: profile.evidence[0].text,
  targetRole: "Software Engineer",
  keywords: "C++, full-stack, robotics",
  additionalContext: "",
  language: "English",
  userContext: "",
};

describe("validateSectionAnalysis", () => {
  it("decides the banner state from presence, not the model", () => {
    const empty = { status: "strong" as const, summary: "", findings: [], ideas: [] };
    expect(validateSectionAnalysis(empty, sectionRequest(false)).state).toBe("improve");
    expect(validateSectionAnalysis(empty, sectionRequest(true)).state).toBe("strong");
  });

  it("keeps only banner ideas grounded in the profile", () => {
    const result = validateSectionAnalysis(
      { status: "strong", summary: "", findings: [{ aspect: "role", verdict: "good", note: "x" }], ideas: ["A screenshot of the Robotics Club site you built", "A photo from your NASA internship"] },
      sectionRequest(),
    );
    expect(result.ideas).toEqual(["A screenshot of the Robotics Club site you built"]);
    expect(result.findings).toEqual([]);
  });
});

describe("headline generation grounding", () => {
  it("accepts headlines built from evidence and the user's own inputs", () => {
    expect(isGroundedHeadline("Aspiring Software Engineer | C++ & Full-Stack Web Developer | Robotics", generation)).toBe(true);
  });

  it("rejects invented employers, credentials, awards, and numbers", () => {
    expect(isGroundedHeadline("Software Engineer at Microsoft", generation)).toBe(false);
    expect(isGroundedHeadline("AWS certified full-stack developer", generation)).toBe(false);
    expect(isGroundedHeadline("Award-winning robotics developer", generation)).toBe(false);
    expect(isGroundedHeadline("Built sites for 5,000 users", generation)).toBe(false);
    expect(isGroundedHeadline("x".repeat(221), generation)).toBe(false);
  });

  it("drops duplicates, the current headline, and ungrounded options", () => {
    const options = validateHeadlineOptions(
      {
        options: [
          { label: "Balanced", headline: "Aspiring Software Engineer | C++ & Web Development" },
          { label: "Same", headline: "aspiring software engineer |  C++ & web development" },
          { label: "Current", headline: profile.evidence[0].text },
          { label: "Invented", headline: "Software Engineer at Microsoft" },
          { label: "Achievement", headline: "Website Developer for 300+ students | Python, C++" },
        ],
      },
      generation,
    );
    expect(options.map((o) => o.label)).toEqual(["Balanced", "Achievement"]);
  });
});

describe("headline options: proof over keyword lists, three different headlines", () => {
  it("rejects a headline that dumps five or more skills, and keeps a proof-led one", () => {
    expect(isKeywordList("Student | Python, C++, web development, robotics & SQL | Developer")).toBe(true);
    expect(isKeywordList("Aspiring Software Engineer | Built a site used by 300+ students | Python & C++")).toBe(false);
    const options = validateHeadlineOptions(
      {
        options: [
          { label: "Technical", headline: "Aspiring Software Engineer | Python, C++, web development, robotics, Code Academy" },
          { label: "Impact", headline: "Aspiring Software Engineer | Built a site used by 300+ students" },
        ],
      },
      generation,
    );
    expect(options.map((o) => o.label)).toEqual(["Impact"]);
  });

  it("drops an option that is another one reworded, so the three are genuinely different", () => {
    expect(similarity("Aspiring Software Engineer | Python and C++", "C++ and Python | Aspiring Software Engineer")).toBeGreaterThan(0.6);
    const options = validateHeadlineOptions(
      {
        options: [
          { label: "Balanced", headline: "Aspiring Software Engineer | Web Development and Robotics" },
          { label: "Reworded", headline: "Robotics and Web Development | Aspiring Software Engineer" },
          { label: "Impact", headline: "Website Developer for 300+ students | Code Academy" },
        ],
      },
      generation,
    );
    expect(options.map((o) => o.label)).toEqual(["Balanced", "Impact"]);
  });
});

describe("About options", () => {
  const aboutRequest: AboutGenerationRequest = { profile, currentAbout: "", targetRole: "Software Engineer", standOut: "projects", additionalContext: "", language: "English", variation: 1, userContext: "" };
  const paragraph = (extra: string) =>
    `I am a student at Westfield High who builds software with Python and C++. ${extra} I studied web development and robotics at Code Academy, and I like turning what I learn into tools other people can use. ` +
    `As the Website Developer for the Robotics Club, I built a site used by 300+ students, and I keep it running as the club grows each year. ` +
    `That work taught me how to plan a project, ship it, and listen to the people who rely on it. ` +
    `Right now I am focused on growing as a software engineer, learning more about web development, and finding projects where I can keep building real things for real users. ` +
    `Outside class I keep practicing with Python and C++, and I enjoy explaining what I learn to classmates in the robotics club.`;
  const long = (extra: string) => `${paragraph(extra)}\n\n${paragraph(extra)}`;

  it("keeps grounded options of a sensible length, and drops invented, too short, and repeated ones", () => {
    const options = validateAboutOptions(
      {
        options: [
          { label: "Balanced", text: long("My goal is steady growth.") },
          { label: "Invented", text: long("I won a national award and led a team of 40 at Google.") },
          { label: "Short", text: "I build software." },
          { label: "Technical", text: "Engineering to me means solving small problems well and shipping the answer. My toolbox is Python and C++, and my favorite problems come from the Robotics Club, where the Website Developer role pushed me to design pages, handle requests, and fix bugs before anyone noticed them. The site I built is now used by 300+ students, which taught me that reliability matters more than clever tricks.\n\nBefore that, Code Academy gave me a base in web development and robotics. I learned to read documentation, write tests, and break a big task into steps that a single afternoon can finish. Today I am looking for a team where I can keep sharpening those habits, take on harder systems, and contribute code that other engineers are glad to maintain. I also like pairing with newer members, because explaining a bug often shows me a cleaner fix." },
        ],
      },
      aboutRequest,
    );
    expect(options.map((o) => o.label)).toEqual(["Balanced", "Technical"]);
    expect(options.every((o) => o.text.split(/\s+/).length >= 110)).toBe(true);
  });
});
