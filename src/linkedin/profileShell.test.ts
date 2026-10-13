// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { extractProfileShell } from "./profileAdapter";

function setPage(url: string, main: string): void {
  Object.defineProperty(document, "URL", { value: url, configurable: true });
  document.body.innerHTML = `<main role="main">${main}</main>`;
}

const TOP_CARD = `
  <section>
    <img alt="Cover photo" src="https://media.licdn.com/dms/image/v2/X/profile-displaybackgroundimage-shrink_350_1400/0">
    <img alt="" src="https://media.licdn.com/dms/image/v2/Y/profile-displayphoto-crop_800_800/0">
    <h1>Jordan Rivera</h1>
  </section>`;

const SECTIONS = `
  <section><h2>About</h2><p>Builds websites.</p></section>
  <section><h2>Experience</h2></section>
  <section><h2><span aria-hidden="true">Skills (50)</span><span class="visually-hidden">Skills (50)</span></h2></section>
  <section><h2>Licenses &amp; certifications (3)</h2></section>
  <section><h2>Interests</h2></section>`;

const OWNER_CONTROLS = `
  <a href="https://www.linkedin.com/in/jordan/edit/intro/">Edit intro</a>
  <button aria-label="Add section">Add section</button>`;

describe("extractProfileShell", () => {
  beforeEach(() => setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}${SECTIONS}`));

  it("reads the photo, banner, and which sections exist with LinkedIn's counts", () => {
    const shell = extractProfileShell(document);
    expect(shell).toMatchObject({ hasPhoto: true, hasBanner: true });
    expect(shell.sections).toEqual({ about: null, experience: null, skills: 50, certifications: 3 });
  });

  it("notices a missing photo, banner, and Featured section", () => {
    setPage("https://www.linkedin.com/in/jordan/", `<section><h1>Jordan</h1><img src="https://static.licdn.com/aero-v1/sc/h/ghost.svg"></section><section><h2>Featured</h2></section>`);
    const shell = extractProfileShell(document);
    expect(shell).toMatchObject({ hasPhoto: false, hasBanner: false });
    expect(shell.sections).toEqual({ featured: null });
  });

  it("recognizes the viewer's own profile from edit links plus an owner-only control", () => {
    setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}${OWNER_CONTROLS}${SECTIONS}`);
    expect(extractProfileShell(document).isOwnProfile).toBe(true);
  });

  it("also accepts LinkedIn's private analytics as the second owner signal", () => {
    setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}<a href="/in/jordan/edit/forms/summary/new/">Edit about</a><section><h2>Analytics</h2><p>Private to you</p></section>`);
    expect(extractProfileShell(document).isOwnProfile).toBe(true);
  });

  it("never treats someone else's profile as the viewer's own", () => {
    setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}<button>Message</button><button>Follow Jordan</button>${SECTIONS}`);
    expect(extractProfileShell(document).isOwnProfile).toBe(false);
  });

  it("needs both signals: an owner-looking button or edit links alone are not enough", () => {
    setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}<button aria-label="Add section">Add section</button>`);
    expect(extractProfileShell(document).isOwnProfile).toBe(false);
    setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}<a href="/in/jordan/edit/intro/">Edit intro</a>`);
    expect(extractProfileShell(document).isOwnProfile).toBe(false);
  });

  it("ignores edit links that belong to a different profile", () => {
    setPage("https://www.linkedin.com/in/jordan/", `${TOP_CARD}<a href="/in/someone-else/edit/intro/">Edit</a><button>Add section</button>`);
    expect(extractProfileShell(document).isOwnProfile).toBe(false);
  });
});

describe("findTopCardPart", () => {
  it("finds the photo, banner, and headline with LinkedIn's own edit controls", async () => {
    const { findTopCardPart } = await import("./profileAdapter");
    setPage(
      "https://www.linkedin.com/in/jordan/",
      `<section>
        <button aria-label="Edit background image"></button>
        <img src="https://media.licdn.com/x/profile-displaybackgroundimage-shrink/0">
        <a href="https://www.linkedin.com/in/jordan/photo"><img src="https://media.licdn.com/y/profile-displayphoto-crop/0"></a>
        <h2>Jordan Rivera</h2>
        <a href="https://www.linkedin.com/in/jordan/edit/intro/">Edit</a>
      </section>`,
    );
    expect(findTopCardPart("banner").editControl?.getAttribute("aria-label")).toBe("Edit background image");
    expect(findTopCardPart("photo").editControl?.getAttribute("href")).toContain("/photo");
    expect(findTopCardPart("headline").element?.textContent).toBe("Jordan Rivera");
    expect(findTopCardPart("headline").editControl?.getAttribute("href")).toContain("/edit/intro/");
  });

  it("reports a default banner as no banner element", async () => {
    const { findTopCardPart } = await import("./profileAdapter");
    setPage("https://www.linkedin.com/in/jordan/", `<section><h2>Jordan Rivera</h2></section>`);
    expect(findTopCardPart("banner")).toEqual({ element: null, editControl: null });
  });
});
