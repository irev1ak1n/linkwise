import { describe, expect, it } from "vitest";
import { isDateLine, isLocationLine, parseEducationLines, parseExperienceLines } from "./entryFields";

describe("entryFields", () => {
  it("recognizes date ranges and durations", () => {
    for (const text of ["Mar 2026 - Present · 7 mos", "2016 – 2025", "8 mos", "1 yr 2 mos", "Sep 2021 – Jun 2025", "2023"]) {
      expect(isDateLine(text)).toBe(true);
    }
    for (const text of ["Acme Robotics", "Computer Engineering", "Legacy European Academy"]) expect(isDateLine(text)).toBe(false);
  });

  it("recognizes locations and work modes", () => {
    expect(isLocationLine("Charlotte, North Carolina, United States · Hybrid")).toBe(true);
    expect(isLocationLine("Remote")).toBe(true);
    expect(isLocationLine("Greater Boston Area")).toBe(true);
    expect(isLocationLine("Skills: C++, Java")).toBe(false);
    expect(isLocationLine("Acme Robotics")).toBe(false);
  });

  it("never takes date metadata as the company", () => {
    expect(parseExperienceLines([{ text: "Software Developer" }, { text: "Mar 2026 - Present · 7 mos" }])).toEqual({ title: "Software Developer", dates: "Mar 2026 - Present · 7 mos" });
    expect(parseExperienceLines([{ text: "Software Developer" }, { text: "8 mos" }], "Acme")).toEqual({ title: "Software Developer", company: "Acme", dates: "8 mos" });
  });

  it("splits a company from its employment type", () => {
    expect(parseExperienceLines([{ text: "Engineer" }, { text: "Acme · Full-time" }, { text: "2020 - 2022" }])).toEqual({ title: "Engineer", company: "Acme", employmentType: "Full-time", dates: "2020 - 2022" });
  });

  it("keeps extra education lines as description in page order", () => {
    expect(parseEducationLines([{ text: "State University" }, { text: "BS" }, { text: "2019 – 2023" }, { text: "Grade: 3.9" }, { text: "Led robotics", description: true }])).toEqual({
      school: "State University",
      degree: "BS",
      dates: "2019 – 2023",
      description: "Grade: 3.9 · Led robotics",
    });
  });
});
