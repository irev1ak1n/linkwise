// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  detailsPageSection,
  detectProfileSections,
  extractLinkedInProfile,
  isProfileManagementUrl,
  normalizeProfileUrl,
  profileIdentityKey,
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
            <div><a href="#"><div><svg aria-hidden="true"></svg></div><div><p>${org}</p></div></a></div>
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
      { title: "Web Team Lead", company: "Feb 2026 - Apr 2026 · 3 mos", description: "• Led a 4-person web team • Reached 300+ visitors" },
    ]);
    expect(profile.volunteering[0]).toEqual({ name: "Tutor", description: "Completed 60+ hours of tutoring in Java" });
    expect(JSON.stringify(profile)).not.toContain("more");
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
