import { describe, expect, it } from "vitest";
import { skillGroups } from "./skillLists";

const groups = (text: string, extra: string[] = []) => skillGroups([{ id: "education:0", section: "education", text }], extra).map((g) => g.text);

describe("skillGroups - explicit skill lists", () => {
  it("keeps every skill of an announced list, grouped by kind instead of cut to the first few", () => {
    const text = "Over 6 years, I acquired skills in Python, C++, C#, .NET, WPF, ASP.NET Core, SQL, JavaScript, PHP, Laravel, web development, robotics, game design, and database management.";
    expect(groups(text)).toEqual(["Python, C++, C#, .NET, WPF, ASP.NET Core, SQL, JavaScript, PHP, Laravel", "web development, robotics, game design, and database management"]);
  });

  it("keeps disciplines apart from tools even when the person lists them as skills", () => {
    const text = "Skills in Python, Laravel, web development, robotics, and game design.";
    expect(groups(text, ["Web Development", "Robotics"])).toEqual(["Python, Laravel", "web development, robotics, and game design"]);
  });

  it("recognizes creative tools and multi-word skills whole", () => {
    expect(groups("I also explored the creative side of technology through Photoshop, video production, and 3D modeling in Blender.")).toEqual(["Photoshop", "video production, and 3D modeling in Blender"]);
    expect(groups("Worked across robotics, web development, game design, Photoshop, video production, and 3D modeling in Blender.")).toEqual([
      "robotics, web development, game design",
      "Photoshop",
      "video production, and 3D modeling in Blender",
    ]);
  });

  it("ends a list where the sentence moves on", () => {
    expect(groups("Studied C++, C#, object-oriented programming, and software development fundamentals through 2+ years of private instruction.")).toEqual([
      "C++, C#",
      "object-oriented programming, and software development fundamentals",
    ]);
  });

  it("keeps a long technology list whole", () => {
    expect(groups("Experienced with Python, JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, Figma, and Git.")).toEqual(["Python, JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, Figma, and Git"]);
  });

  it("finds two skills side by side in prose, but not one alone", () => {
    expect(groups("Completed 150+ hours of tutoring in Python and C++, supporting 15+ students.")).toEqual(["Python and C++"]);
    expect(groups("Built a tutoring site in Python for my school.")).toEqual([]);
  });

  it("uses skills the semantic analysis classified, for names it does not know", () => {
    expect(groups("Shipped features in Zorbix and Quillon every week.")).toEqual([]);
    expect(groups("Shipped features in Zorbix and Quillon every week.", ["Zorbix", "Quillon"])).toEqual(["Zorbix and Quillon"]);
  });
});

describe("skillGroups - false positives", () => {
  it("never reads generic nouns as technical skills", () => {
    expect(groups("Worked on development of relationships and management of scheduling.")).toEqual([]);
    expect(groups("Helped with production, management, and development of the event.")).toEqual([]);
  });

  it("does not take an ordinary capitalized sentence for a product list", () => {
    expect(groups("I joined the team in March, and The Club grew quickly.")).toEqual([]);
    // After a generic cue, only known tools count: schools and clubs are not skills.
    expect(groups("Volunteered at events including Northfield High, Riverside Library, and Python workshops.")).toEqual(["Python"]);
  });

  it("is deterministic for the same text", () => {
    const text = "Skills include Python, SQL, web development, and Figma.";
    expect(groups(text)).toEqual(groups(text));
  });
});
