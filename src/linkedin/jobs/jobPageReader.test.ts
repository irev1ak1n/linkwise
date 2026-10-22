// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { currentJobId, expandCollapsed, findJobDetails, readJobPosting } from "./jobPageReader";

function render(html: string, title = "Software Engineering Intern | Meta | LinkedIn"): void {
  document.title = title;
  document.body.innerHTML = html;
}

const NEW_LAYOUT = `
<div data-testid="lazy-column">
  <div>Meta</div><div>Software Engineering Intern</div>
  <div>Seattle, WA · 2 weeks ago · Over 100 people clicked apply</div>
  <div>Hybrid</div><div>Internship</div><button>Apply</button><button>Save</button>
  <div componentkey="JobDetails_AboutTheJob_555">
    <h2>About the job</h2>
    <span data-testid="expandable-text-box"><p>Build features used by billions. Pay range: $28/hr - $31/hr.</p><p id="tail" hidden>Minimum qualifications</p><button data-testid="expandable-text-button" aria-hidden="true">… more</button></span>
  </div>
  <div componentkey="JobDetails_AboutTheCompany_555">
    <h2>About the company</h2><div>Meta</div><div>Software Development</div><div>10001+ employees</div>
    <span data-testid="expandable-text-box"><p>Meta builds technologies.</p><button data-testid="expandable-text-button">… more</button></span>
    <h2>Interested in working with us in the future?</h2><div>Not part of the company text</div>
  </div>
</div>`;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("job id", () => {
  it("comes from the URL, which LinkedIn updates when another job is clicked, in search and view layouts", () => {
    render("");
    expect(currentJobId("https://www.linkedin.com/jobs/search-results/?currentJobId=4476596043&keywords=x", document)).toBe("4476596043");
    expect(currentJobId("https://www.linkedin.com/jobs/view/software-engineer-at-meta-4476596043/", document)).toBe("4476596043");
    expect(currentJobId("https://www.linkedin.com/jobs/view/4476596043", document)).toBe("4476596043");
    expect(currentJobId("https://www.linkedin.com/feed/", document)).toBeNull();
  });

  it("falls back to the id in the details markup", () => {
    render(NEW_LAYOUT);
    expect(currentJobId("https://www.linkedin.com/jobs/collections/recommended/", document)).toBe("555");
  });
});

describe("reading the open job", () => {
  it("splits the top card, the description, and the company section", () => {
    render(NEW_LAYOUT);
    const posting = readJobPosting(document, "https://www.linkedin.com/jobs/search-results/?currentJobId=555")!;
    expect(posting).toMatchObject({ jobId: "555", title: "Software Engineering Intern", company: "Meta" });
    expect(posting.headerLines).toEqual(expect.arrayContaining(["Seattle, WA · 2 weeks ago · Over 100 people clicked apply", "Hybrid", "Internship"]));
    expect(posting.headerLines).not.toContain("Apply");
    expect(posting.description).toContain("Pay range: $28/hr - $31/hr.");
    expect(posting.description).not.toMatch(/… more|About the company/);
    expect(posting.companyText).toContain("10001+ employees");
    expect(posting.companyText).not.toContain("Not part of the company text");
  });

  it("returns nothing when no job is open or its description has not loaded", () => {
    render("<main>feed</main>");
    expect(findJobDetails(document)).toBeNull();
    expect(readJobPosting(document, "https://www.linkedin.com/feed/")).toBeNull();
    render('<div data-testid="lazy-column"><div componentkey="JobDetails_AboutTheJob_9"><h2>About the job</h2></div></div>');
    expect(readJobPosting(document, "https://www.linkedin.com/jobs/search-results/?currentJobId=9")).toBeNull();
  });

  it("reads an older layout's container", () => {
    render(`<div class="jobs-search__job-details--container"><h2>About the job</h2><div>Old layout text. Salary: $50,000 per year.</div></div>`);
    const posting = readJobPosting(document, "https://www.linkedin.com/jobs/search/?currentJobId=777")!;
    expect(posting.description).toContain("Salary: $50,000 per year.");
  });
});

describe("expanding collapsed sections", () => {
  it("opens each '… more' control once, so the full text is read, and never clicks an opened one again", () => {
    render(NEW_LAYOUT);
    const tail = document.getElementById("tail")!;
    for (const button of document.querySelectorAll("button[data-testid='expandable-text-button']")) button.addEventListener("click", () => tail.removeAttribute("hidden"));
    expect(expandCollapsed(findJobDetails(document)!)).toBe(2);
    expect(tail.hasAttribute("hidden")).toBe(false);
    expect(expandCollapsed(findJobDetails(document)!)).toBe(0);
  });

  it("never presses a 'more' outside the posting's own sections, or one that is a link, since that leaves the page", () => {
    render(`<div data-testid="lazy-column">
      <div id="hiring-post"><button id="post-more">… more</button><a href="/feed/update/urn:li:activity:1"><button id="link-more">… more</button></a></div>
      <div componentkey="JobDetails_AboutTheJob_5"><a href="/somewhere"><button id="inner-link">… more</button></a><button id="real">… more</button></div>
    </div>`);
    const pressed: string[] = [];
    for (const button of document.querySelectorAll("button")) button.addEventListener("click", () => pressed.push(button.id));
    expandCollapsed(findJobDetails(document)!);
    expect(pressed).toEqual(["real"]);
  });

  it("leaves expanded and unrelated buttons alone", () => {
    render(`<div data-testid="lazy-column"><button aria-expanded="true">… more</button><button>Apply</button><button>Show more jobs</button></div>`);
    expect(expandCollapsed(document.body)).toBe(0);
  });
});
