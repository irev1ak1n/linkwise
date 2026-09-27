// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  detailsPageSection,
  detectProfileSections,
  extractLinkedInProfile,
  isProfileManagementUrl,
  normalizeProfileUrl,
  profileIdentityKey,
  extractDetailsPageProfile,
} from "./profileAdapter";

function setBody(html: string): void {
  document.body.innerHTML = html;
}

// A synthetic but structurally realistic profile page, mirroring the shape real-Chrome
// verification is checked against.
function setFullProfilePage(): void {
  setBody(`
    <main role="main">
      <section>
        <h1><span aria-hidden="true">Jordan Rivera</span></h1>
        <div><span aria-hidden="true">FRC mentor and robotics coach</span></div>
        <div><span>Austin, Texas Area</span></div>
      </section>
      <section>
        <h2>About</h2>
        <span aria-hidden="true">I have spent 8 years as an FRC mentor, helping student teams design and build competition robots.…see more</span>
      </section>
      <section>
        <h2>Experience</h2>
        <ul>
          <li>
            <span aria-hidden="true">Robotics Mentor</span>
            <span aria-hidden="true">Local FRC Team</span>
            <span aria-hidden="true">Coach students on mechanical design, programming, and competition strategy for the annual FIRST Robotics Competition season.</span>
          </li>
          <li>
            <span aria-hidden="true">Software Engineer</span>
            <span aria-hidden="true">Acme Corp</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Education</h2>
        <ul>
          <li>
            <span aria-hidden="true">University of Texas</span>
            <span aria-hidden="true">B.S. Mechanical Engineering</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Skills</h2>
        <ul>
          <li><span aria-hidden="true">Python</span></li>
          <li><span aria-hidden="true">Robotics</span></li>
          <li><span aria-hidden="true">Mentoring</span></li>
        </ul>
      </section>
      <section>
        <h2>Projects</h2>
        <ul>
          <li>
            <span aria-hidden="true">Autonomous Line-Following Robot</span>
            <span aria-hidden="true">Built a PID-controlled robot for a regional FRC scrimmage using Python and OpenCV.</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Licenses &amp; certifications</h2>
        <ul>
          <li>
            <span aria-hidden="true">FIRST Robotics Certified Mentor</span>
            <span aria-hidden="true">FIRST Robotics Competition</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Organizations</h2>
        <ul>
          <li>
            <span aria-hidden="true">IEEE Robotics and Automation Society</span>
          </li>
        </ul>
      </section>
      <section>
        <h2>Volunteering</h2>
        <ul>
          <li>
            <span aria-hidden="true">Robotics Camp Volunteer</span>
            <span aria-hidden="true">Coached middle schoolers in a summer robotics camp for underserved students.</span>
          </li>
        </ul>
      </section>
    </main>
  `);
}

describe("extractLinkedInProfile - full profile", () => {
  it("extracts name and headline", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.extracted).toBe(true);
    expect(profile.name).toBe("Jordan Rivera");
    expect(profile.headline).toBe("FRC mentor and robotics coach");
  });

  it("extracts the About section without the trailing 'see more' control text", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.about).toContain("FRC mentor");
    expect(profile.about).not.toContain("see more");
  });

  it("extracts experience entries with title, company, and description", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.experience.length).toBeGreaterThanOrEqual(2);
    expect(profile.experience[0].title).toBe("Robotics Mentor");
    expect(profile.experience[0].company).toBe("Local FRC Team");
    expect(profile.experience[0].description).toContain("FIRST Robotics Competition");
  });

  it("extracts education entries", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.education).toHaveLength(1);
    expect(profile.education[0].school).toBe("University of Texas");
  });

  it("extracts skills", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.skills).toContain("Python");
    expect(profile.skills).toContain("Robotics");
  });

  it("extracts projects", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.projects).toHaveLength(1);
    expect(profile.projects[0].name).toBe("Autonomous Line-Following Robot");
    expect(profile.projects[0].description).toContain("FRC scrimmage");
  });

  it("extracts certifications, matching the real-world 'Licenses & certifications' heading", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.certifications).toHaveLength(1);
    expect(profile.certifications[0].name).toBe("FIRST Robotics Certified Mentor");
  });

  it("extracts organizations", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.organizations).toHaveLength(1);
    expect(profile.organizations[0].name).toBe("IEEE Robotics and Automation Society");
  });

  it("extracts volunteering", () => {
    setFullProfilePage();
    const profile = extractLinkedInProfile(document);
    expect(profile.volunteering).toHaveLength(1);
    expect(profile.volunteering[0].name).toBe("Robotics Camp Volunteer");
    expect(profile.volunteering[0].description).toContain("summer robotics camp");
  });

  it("never returns a mutual connection's bare connection-degree badge as the headline", () => {
    // The identity card can widen to include mutual-connection badges, short plain text
    // that would otherwise satisfy the generic headline filter before the real one.
    setBody(`
      <main role="main">
        <section>
          <h1><span aria-hidden="true">Aaryan Gupta</span></h1>
          <span>· 2nd</span>
          <span>· 1st</span>
          <span>· 1st</span>
          <div><span aria-hidden="true">Incoming Freshman at Duke University</span></div>
          <span>Charlotte, North Carolina, United States</span>
        </section>
      </main>
    `);
    const profile = extractLinkedInProfile(document);
    expect(profile.headline).toBe("Incoming Freshman at Duke University");
  });

  it("never returns a pronoun badge as the headline (confirmed live on a real profile)", () => {
    // The "She/Her" pronoun badge sits above the real headline in document order, as its own
    // short plain-text span. Without filtering it, it gets returned as the headline instead.
    setBody(`
      <main role="main">
        <section>
          <h1><span aria-hidden="true">Jordan Rivera</span></h1>
          <span>She/Her</span>
          <span>· 2nd</span>
          <div><span aria-hidden="true">Mechanical Engineering Student | University of Michigan</span></div>
        </section>
      </main>
    `);
    const profile = extractLinkedInProfile(document);
    expect(profile.headline).toBe("Mechanical Engineering Student | University of Michigan");
  });

  it("never doubles text that has both an aria-hidden copy and a screen-reader-only copy", () => {
    setBody(`
      <main role="main">
        <section>
          <h1>
            <span aria-hidden="true">Jordan Rivera</span>
            <span class="visually-hidden">Jordan Rivera</span>
          </h1>
        </section>
      </main>
    `);
    const profile = extractLinkedInProfile(document);
    expect(profile.name).toBe("Jordan Rivera");
  });
});

describe("extractLinkedInProfile - incomplete or non-profile pages", () => {
  it("reports extracted:false when there is no h1 or headline to find at all", () => {
    setBody('<main role="main"><div>unrelated content</div></main>');
    const profile = extractLinkedInProfile(document);
    expect(profile.extracted).toBe(false);
    expect(profile.name).toBeUndefined();
  });

  it("never invents experience/education/skills that aren't present", () => {
    setBody('<main role="main"><h1><span aria-hidden="true">Jordan Rivera</span></h1></main>');
    const profile = extractLinkedInProfile(document);
    expect(profile.extracted).toBe(true);
    expect(profile.experience).toEqual([]);
    expect(profile.education).toEqual([]);
    expect(profile.skills).toEqual([]);
  });
});

describe("detectProfileSections", () => {
  it("detects every section heading present on a full profile", () => {
    setFullProfilePage();
    const detected = detectProfileSections(document);
    expect(detected).toEqual(
      expect.arrayContaining([
        "about",
        "experience",
        "education",
        "skills",
        "projects",
        "certifications",
        "organizations",
        "volunteering",
      ]),
    );
  });

  it("detects a section heading even when its body content hasn't rendered yet", () => {
    setBody(`
      <main role="main">
        <section>
          <h1><span aria-hidden="true">Jordan Rivera</span></h1>
        </section>
        <section>
          <h2>Education</h2>
        </section>
      </main>
    `);
    const profile = extractLinkedInProfile(document);
    const detected = detectProfileSections(document);
    expect(profile.education).toEqual([]); // no content captured yet
    expect(detected).toContain("education"); // but the heading is already visible
  });

  it("detects skills via the compact 'Top skills' widget even with no Skills heading", () => {
    setBody(`
      <main role="main">
        <section>
          <h1><span aria-hidden="true">Jordan Rivera</span></h1>
        </section>
        <div>
          <p>Top skills</p>
          <div>Python • Robotics • Mentoring</div>
        </div>
      </main>
    `);
    expect(detectProfileSections(document)).toContain("skills");
  });

  it("detects nothing beyond identity on a sparse profile with no sections at all", () => {
    setBody('<main role="main"><h1><span aria-hidden="true">Jordan Rivera</span></h1></main>');
    expect(detectProfileSections(document)).toEqual([]);
  });
});

describe("profileIdentityKey", () => {
  it("extracts the vanity slug from a real profile URL", () => {
    expect(profileIdentityKey("https://www.linkedin.com/in/sahandhdz/")).toBe("sahandhdz");
  });

  it("ignores volatile tracking query params, which must not change the identity", () => {
    const a = profileIdentityKey("https://www.linkedin.com/in/sahandhdz/?miniProfileUrn=xyz");
    const b = profileIdentityKey("https://www.linkedin.com/in/sahandhdz/?trk=nav_responsive");
    expect(a).toBe(b);
    expect(a).toBe("sahandhdz");
  });

  it("returns different keys for different profiles", () => {
    const a = profileIdentityKey("https://www.linkedin.com/in/sahandhdz/");
    const b = profileIdentityKey("https://www.linkedin.com/in/williamhgates/");
    expect(a).not.toBe(b);
  });

  it("returns null for a non-profile URL", () => {
    expect(profileIdentityKey("https://www.linkedin.com/jobs/search/")).toBeNull();
  });
});

describe("extractLinkedInProfile - determinism", () => {
  it("produces identical output across repeated calls on the same DOM", () => {
    setFullProfilePage();
    const first = extractLinkedInProfile(document);
    const second = extractLinkedInProfile(document);
    expect(second).toEqual(first);
  });
});

describe("detailsPageSection", () => {
  it("recognizes every real details-page slug", () => {
    const base = "https://www.linkedin.com/in/irev1ak1n/details";
    expect(detailsPageSection(`${base}/experience/`)).toBe("experience");
    expect(detailsPageSection(`${base}/education/`)).toBe("education");
    expect(detailsPageSection(`${base}/skills/`)).toBe("skills");
    expect(detailsPageSection(`${base}/languages/`)).toBe("languages");
    expect(detailsPageSection(`${base}/honors/`)).toBe("honors");
    expect(detailsPageSection(`${base}/certifications/`)).toBe("certifications");
    expect(detailsPageSection(`${base}/projects/`)).toBe("projects");
    expect(detailsPageSection(`${base}/organizations/`)).toBe("organizations");
    expect(detailsPageSection(`${base}/volunteering-experiences/`)).toBe("volunteering");
  });

  it("does not recognize the singular 'volunteer-experiences' slug, which only appears in edit-form links", () => {
    expect(detailsPageSection("https://www.linkedin.com/in/irev1ak1n/details/volunteer-experiences/")).toBeNull();
  });

  it("returns null off a details page, and for an unrecognized slug", () => {
    expect(detailsPageSection("https://www.linkedin.com/in/irev1ak1n/")).toBeNull();
    expect(detailsPageSection("https://www.linkedin.com/in/irev1ak1n/details/recommendations/")).toBeNull();
  });
});

describe("isProfileManagementUrl", () => {
  it("recognizes an 'edit this entry' route", () => {
    expect(isProfileManagementUrl("/in/irev1ak1n/details/education/edit/forms/12345/")).toBe(true);
    expect(isProfileManagementUrl("https://www.linkedin.com/in/irev1ak1n/details/volunteer-experiences/edit/forms/1/")).toBe(true);
  });

  it("leaves a real read-only detail page alone", () => {
    expect(isProfileManagementUrl("/in/irev1ak1n/details/education/")).toBe(false);
    expect(isProfileManagementUrl("https://www.linkedin.com/in/irev1ak1n/details/experience/")).toBe(false);
  });

  it("recognizes an add/create form even without the word 'edit' in the path", () => {
    expect(isProfileManagementUrl("/in/irev1ak1n/details/languages/edit/forms/new/")).toBe(true);
    expect(isProfileManagementUrl("/in/irev1ak1n/details/skills/add/")).toBe(true);
    expect(isProfileManagementUrl("/in/irev1ak1n/details/projects/create/")).toBe(true);
  });
});

describe("normalizeProfileUrl", () => {
  it("resolves the main profile and every one of its detail pages to the same person", () => {
    const urls = [
      "https://www.linkedin.com/in/irev1ak1n/",
      "https://www.linkedin.com/in/irev1ak1n/details/experience/",
      "https://www.linkedin.com/in/irev1ak1n/details/education/",
    ];
    const normalized = urls.map(normalizeProfileUrl);
    expect(normalized.every((u) => u?.includes("irev1ak1n"))).toBe(true);
  });

  it("normalizes tracking params and relative hrefs to the same canonical form", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/in/irev1ak1n/details/experience/?originalSubdomain=en")).toBe(
      "https://www.linkedin.com/in/irev1ak1n/details/experience/",
    );
    expect(normalizeProfileUrl("/in/irev1ak1n/details/experience/")).toBe(
      "https://www.linkedin.com/in/irev1ak1n/details/experience/",
    );
  });

  it("keeps the main profile and a details page as distinct normalized URLs", () => {
    const main = normalizeProfileUrl("https://www.linkedin.com/in/irev1ak1n/");
    const details = normalizeProfileUrl("https://www.linkedin.com/in/irev1ak1n/details/experience/");
    expect(main).not.toBe(details);
  });

  it("returns null for a non-profile URL", () => {
    expect(normalizeProfileUrl("https://www.linkedin.com/jobs/search/")).toBeNull();
  });
});

describe("extractLinkedInProfile - newer paragraph-based layout", () => {
  function newLayoutEntry(title: string, dates: string, bullets: string[], org: string): string {
    return `
      <li>
        <div><a href="#"><div><p>${title}</p><p>${dates}</p></div></a>
          <div>
            <p><span data-testid="expandable-text-box">${bullets.join("<br><br>")}<br><br>
              <button data-testid="expandable-text-button" aria-hidden="true"><span><span>…</span><span>more</span></span></button>
            </span></p>
            <div><a href="https://example.com/media"><div><svg aria-hidden="true"></svg></div><div><p>${org}</p></div></a></div>
          </div>
        </div>
      </li>`;
  }

  it("reads title, dates, and full description without the '… more' control", () => {
    setBody(`
      <main role="main">
        <section><h1>Jordan Rivera</h1><p>Student Developer</p></section>
        <section><h2>Experience</h2><ul>
          ${newLayoutEntry("Web Team Lead", "Feb 2026 - Apr 2026 · 3 mos", ["• Led a 4-person web team", "• Reached 300+ visitors"], "Robotics Club")}
        </ul></section>
        <section><h2>Volunteering</h2><ul>
          ${newLayoutEntry("Tutor", "Sep 2025 - May 2026", ["Completed 60+ hours of tutoring in Java"], "Library")}
        </ul></section>
      </main>
    `);
    const profile = extractLinkedInProfile(document);
    expect(profile.experience).toEqual([
      { title: "Web Team Lead", dates: "Feb 2026 - Apr 2026 · 3 mos", description: "• Led a 4-person web team • Reached 300+ visitors" },
    ]);
    expect(profile.volunteering[0]).toEqual({ name: "Tutor", description: "Completed 60+ hours of tutoring in Java" });
    expect(JSON.stringify(profile)).not.toContain("more");
  });
});

describe("extractLinkedInProfile - entries separated by <hr>", () => {
  function setSeparatedLayout(): void {
    setBody(`
      <main role="main">
        <section><h1>Jordan Rivera</h1><p>Student Developer</p></section>
        <section><h2>Experience</h2>
          <div>
            <a href="/company/1/"><div><p>Lincoln High School</p><p>8 mos</p></div><p>Austin, Texas, United States</p></a>
            <ul>
              <li><a href="/in/jordan/edit/forms/position/1/"><p>Yearbook Website Developer</p><p>Mar 2026 - Present · 7 mos</p></a>
                <span data-testid="expandable-text-box">Built the yearbook website</span>
                <a href="https://yearbook.example.com/"><p>Yearbook Site</p></a></li>
              <li><p>Prom Committee Member</p><p>Feb 2026 - Apr 2026 · 3 mos</p><span data-testid="expandable-text-box">Sold 250 tickets</span></li>
            </ul>
            <hr>
            <div><p>Video Editor</p><p>Legacy Academy</p><p>May 2024 - Present · 2 yrs 5 mos</p><p>Austin, Texas, United States · Hybrid</p><span data-testid="expandable-text-box">Edited videos</span></div>
            <hr>
            <div><p>Private Programming Tutor</p><p>Self-Employed · Part-time</p><p>Jul 2020 - Nov 2024 · 4 yrs 5 mos</p><p>Hybrid</p></div>
            <hr>
            <div><p>Volunteer</p><p>Jan 2023 - Present</p></div>
          </div>
        </section>
        <section><h2>Education</h2>
          <div><a href="/school/1/"><p>State Academy</p><p>Higher National Diploma, Software Engineering</p></a><p>2016 – 2025</p>
            <span data-testid="expandable-text-box">Studied C++ for 9 years</span><a href="#">C++, Java and +3 skills</a></div>
          <hr>
          <div><p>City High School</p><p>Computer Engineering</p><p>2024 – 2027</p><p>Grade: 4.2 GPA</p></div>
          <hr><a href="/in/jordan/details/education/"><span>Show all 5 educations</span></a>
        </section>
      </main>
    `);
  }

  it("reads each honor on the main page as its own named entry", () => {
    setBody(`
      <main role="main">
        <section><h1>Jordan Rivera</h1><p>Student Developer</p></section>
        <section><h2>Honors &amp; awards (2)</h2>
          <div><p>AP Scholar Award</p><p>Issued by College Board</p></div>
          <hr>
          <div><p>2nd Place - Webmaster</p><p>Issued by TSA</p></div>
        </section>
      </main>
    `);
    expect(extractLinkedInProfile(document).honors).toEqual([
      { name: "AP Scholar Award", description: "Issued by College Board" },
      { name: "2nd Place - Webmaster", description: "Issued by TSA" },
    ]);
  });

  it("takes a grouped role's company from its employer header, never from its date line", () => {
    setSeparatedLayout();
    const experience = extractLinkedInProfile(document).experience;
    expect(experience.slice(0, 2)).toEqual([
      { title: "Yearbook Website Developer", company: "Lincoln High School", dates: "Mar 2026 - Present · 7 mos", description: "Built the yearbook website" },
      { title: "Prom Committee Member", company: "Lincoln High School", dates: "Feb 2026 - Apr 2026 · 3 mos", description: "Sold 250 tickets" },
    ]);
  });

  it("keeps dates, location and employment type out of the company", () => {
    setSeparatedLayout();
    const experience = extractLinkedInProfile(document).experience;
    expect(experience[2]).toEqual({
      title: "Video Editor",
      company: "Legacy Academy",
      dates: "May 2024 - Present · 2 yrs 5 mos",
      location: "Austin, Texas, United States · Hybrid",
      description: "Edited videos",
    });
    expect(experience[3]).toEqual({ title: "Private Programming Tutor", employmentType: "Self-Employed · Part-time", dates: "Jul 2020 - Nov 2024 · 4 yrs 5 mos", location: "Hybrid" });
  });

  it("leaves the company empty rather than guessing it", () => {
    setSeparatedLayout();
    expect(extractLinkedInProfile(document).experience[4]).toEqual({ title: "Volunteer", dates: "Jan 2023 - Present" });
  });

  it("reads each school as its own structured entry instead of one run-together blob", () => {
    setSeparatedLayout();
    expect(extractLinkedInProfile(document).education).toEqual([
      { school: "State Academy", degree: "Higher National Diploma, Software Engineering", dates: "2016 – 2025", description: "Studied C++ for 9 years" },
      { school: "City High School", degree: "Computer Engineering", dates: "2024 – 2027", description: "Grade: 4.2 GPA" },
    ]);
  });
});

describe("extractLinkedInProfile - sidebar headings", () => {
  it("never reads the sidebar 'Profile language' card as the Languages section", () => {
    setBody(`
      <main role="main">
        <section><h1>Jordan Rivera</h1><p>Student Developer</p></section>
        <section><h2>Profile language</h2><p>English</p></section>
      </main>
    `);
    expect(extractLinkedInProfile(document).languages).toEqual([]);
    expect(detectProfileSections(document)).not.toContain("languages");
  });

  it("still reads a counted 'Languages (3)' section", () => {
    setBody(`
      <main role="main">
        <section><h1>Jordan Rivera</h1><p>Student Developer</p></section>
        <section><h2>Languages (3)</h2><ul><li><p>Spanish</p><p>Native or bilingual proficiency</p></li></ul></section>
        <section><h2>Profile language</h2><p>English</p></section>
      </main>
    `);
    expect(extractLinkedInProfile(document).languages).toEqual([{ name: "Spanish", description: "Native or bilingual proficiency" }]);
  });
});

describe("extractLinkedInProfile - single entries beside grouped positions", () => {
  it("keeps a single position that is not a list item", () => {
    setBody(`
      <main role="main">
        <section><h1>Jordan Rivera</h1><p>Student Developer</p></section>
        <section><h2>Experience</h2>
          <div><p>Robotics Club</p><ul><li><p>Web Team Lead</p><p>Feb 2026 - Apr 2026</p><p>• Led a 4-person web team</p></li></ul></div>
          <div><p>Private Tutor</p><p>Self-Employed</p><p><span>• Completed 60+ hours of tutoring<br>• Supported 15+ students</span><button aria-hidden="true">… more</button></p></div>
          <a href="#">Show all 5 experiences</a>
        </section>
      </main>
    `);
    const experience = extractLinkedInProfile(document).experience;
    expect(experience[0]).toMatchObject({ title: "Web Team Lead" });
    expect(experience[1]!.description).toBe("Robotics Club Private Tutor Self-Employed • Completed 60+ hours of tutoring • Supported 15+ students");
  });
});

describe("extractDetailsPageProfile", () => {
  function setDetailsPage(url: string, testid: string, entries: string[][]): void {
    Object.defineProperty(document, "URL", { value: url, configurable: true });
    const items = entries.map((lines) => `<div componentkey="x"><a href="#"><div>${lines.map((l) => `<p>${l}</p>`).join("")}</div></a></div>`).join('<hr role="presentation">');
    setBody(`
      <main role="main">
        <div><p>Jordan Rivera</p><p>Verify in 2 minutes</p></div>
        <div data-testid="${testid}"><div><div>${items}</div></div></div>
        <section><h2>Profile language</h2><p>English</p></section>
        <section><h2>People you may know</h2><p>Sam Lee · Robotics Club</p></section>
      </main>
    `);
  }

  it("reads only the section's own entries on a new-layout details page", () => {
    setDetailsPage("https://www.linkedin.com/in/jordan/details/education/", "profile_EducationDetailsSection_jordan", [
      ["State University", "BS Computer Science", "2021 – 2025", "Led the robotics club"],
      ["City High School", "Diploma"],
    ]);
    const profile = extractDetailsPageProfile(document);
    expect(profile.education).toEqual([
      { school: "State University", degree: "BS Computer Science", dates: "2021 – 2025", description: "Led the robotics club" },
      { school: "City High School", degree: "Diploma" },
    ]);
    expect(profile.headline).toBeUndefined();
    expect(profile.location).toBeUndefined();
    expect(profile.languages).toEqual([]);
    expect(profile.extracted).toBe(true);
  });

  it("maps list sections to name and description", () => {
    setDetailsPage("https://www.linkedin.com/in/jordan/details/honors/", "profile_HonorsDetailsSection_jordan", [["2nd Place - Webmaster", "Issued by TSA", "Earned 2nd place at regionals"]]);
    expect(extractDetailsPageProfile(document).honors).toEqual([{ name: "2nd Place - Webmaster", description: "Issued by TSA · Earned 2nd place at regionals" }]);
  });

  it("reads a profile-card entry list that has no DetailsSection test id", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/certifications/", configurable: true });
    setBody(`
      <main role="main">
        <div><p>Jordan Rivera</p><p>Verify in 2 minutes</p></div>
        <section><div componentkey="com.linkedin.sdui.profile.card.refABC"><div>
          <div><p>AWS Cloud Practitioner</p><p>Amazon Web Services</p></div>
          <hr role="presentation">
          <div><p>Google IT Support</p><p>Google</p></div>
        </div></div></section>
        <section><h2>People you may know</h2><p>Sam Lee</p></section>
      </main>
    `);
    expect(extractDetailsPageProfile(document).certifications).toEqual([
      { name: "AWS Cloud Practitioner", description: "Amazon Web Services" },
      { name: "Google IT Support", description: "Google" },
    ]);
  });

  it("reads every entry when each one is wrapped with its own separator", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/experience/", configurable: true });
    setBody(`
      <main role="main">
        <section><div componentkey="com.linkedin.sdui.profile.card.refABC"><div>
          <div><p>Experience</p></div>
          <div><p>Web Lead</p><p>Yearbook Club</p></div>
          <div><hr role="presentation"><div><p>Tutor</p><p>Self-Employed</p></div></div>
          <div><hr role="presentation"><div><p>Video Editor</p><p>Academy</p></div></div>
        </div></div></section>
      </main>
    `);
    expect(extractDetailsPageProfile(document).experience.map((e) => e.title)).toEqual(["Web Lead", "Tutor", "Video Editor"]);
  });

  it("reads both entries when a wrapped layout has a single separator", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/experience/", configurable: true });
    setBody(`
      <main role="main">
        <div componentkey="com.linkedin.sdui.profile.card.refABC"><div>
          <div><p>Web Lead</p><p>Yearbook Club</p></div>
          <div><hr role="presentation"><div><p>Tutor</p><p>Self-Employed</p></div></div>
        </div></div>
      </main>
    `);
    expect(extractDetailsPageProfile(document).experience.map((e) => e.title)).toEqual(["Web Lead", "Tutor"]);
  });

  it("reads grouped roles on a details page with the employer as their company", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/experience/", configurable: true });
    setBody(`
      <main role="main">
        <div componentkey="com.linkedin.sdui.profile.card.refABC"><div>
          <div><p>Experience</p></div>
          <div><a href="/company/1/"><p>Lincoln High School</p><p>8 mos</p></a>
            <ul><li><p>Yearbook Website Developer</p><p>Mar 2026 - Present · 7 mos</p></li></ul></div>
          <div><hr role="presentation"><div><p>Tutor</p><p>Self-Employed</p><p>Jul 2020 - Nov 2024</p><p>Skills: C++, Java</p></div></div>
        </div></div>
      </main>
    `);
    expect(extractDetailsPageProfile(document).experience).toEqual([
      { title: "Yearbook Website Developer", company: "Lincoln High School", dates: "Mar 2026 - Present · 7 mos" },
      { title: "Tutor", employmentType: "Self-Employed", dates: "Jul 2020 - Nov 2024", description: "Skills: C++, Java" },
    ]);
  });

  it("keeps an award whose title looks like the section heading, dropping only the heading itself", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/honors/", configurable: true });
    setBody(`
      <main role="main">
        <div componentkey="com.linkedin.sdui.profile.card.refABC"><p>Honors &amp; awards</p><div>
          <div><p>AP Scholar Award</p><p>Issued by College Board · Jun 2026</p></div>
          <hr role="presentation">
          <div><p>2nd Place - Webmaster</p><p>Issued by TSA</p><span data-testid="expandable-text-box">Earned 2nd place at regionals</span></div>
        </div></div>
      </main>
    `);
    expect(extractDetailsPageProfile(document).honors).toEqual([
      { name: "AP Scholar Award", description: "Issued by College Board · Jun 2026" },
      { name: "2nd Place - Webmaster", description: "Issued by TSA · Earned 2nd place at regionals" },
    ]);
  });

  it("reads a single-entry details page without taking its heading as an entry", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/education/", configurable: true });
    setBody(`
      <main role="main">
        <div data-testid="profile_EducationDetailsSection_jordan"><p>Education</p><div><p>City High School</p><p>High School Diploma</p><p>2024 – Present</p></div></div>
      </main>
    `);
    expect(extractDetailsPageProfile(document).education).toEqual([{ school: "City High School", degree: "High School Diploma", dates: "2024 – Present" }]);
  });

  it("falls back to the regular extractor without a DetailsSection container", () => {
    Object.defineProperty(document, "URL", { value: "https://www.linkedin.com/in/jordan/details/education/", configurable: true });
    setBody(`<main role="main"><h1>Jordan Rivera</h1><section><h2>Education</h2><ul><li><p>State University</p><p>BS</p></li></ul></section></main>`);
    expect(extractDetailsPageProfile(document).education[0]).toMatchObject({ school: "State University" });
  });
});

describe("extractLinkedInProfile - owner view prompts", () => {
  it("never reads a verification prompt link as the headline or location", () => {
    setBody(`
      <main role="main">
        <section>
          <h1>Jordan Rivera</h1>
          <a href="https://www.linkedin.com/trust/verification"><div><p>Verify in 2 minutes</p></div></a>
          <div><p>Aspiring Software Engineer | Robotics Club Lead</p></div>
          <div><p>Charlotte, North Carolina, United States</p><p>·</p><a href="/overlay/contact-info/"><p>Contact info</p></a></div>
          <button type="button">Open to</button>
        </section>
      </main>
    `);
    const profile = extractLinkedInProfile(document);
    expect(profile.headline).toBe("Aspiring Software Engineer | Robotics Club Lead");
    expect(profile.location).toBe("Charlotte, North Carolina, United States");
  });
});
