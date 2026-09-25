// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractCardText, matchedKeyword, parseKeywords } from "./keywordMatcher";

function buildRealisticCard(): HTMLElement {
  const li = document.createElement("li");
  li.innerHTML = `
    <a href="/jobs/view/123/" class="job-card-list__title--link">
      <span aria-hidden="true">Senior Java Software Engineer</span>
    </a>
    <div class="artdeco-entity-lockup__subtitle"><span>Scherzi Systems, LLC</span></div>
    <ul class="job-card-container__metadata-wrapper">
      <li><span>East Syracuse, NY (Hybrid)</span></li>
    </ul>
    <ul class="job-card-container__footer-wrapper">
      <li class="job-card-container__footer-item">Promoted</li>
      <li class="job-card-container__footer-item">Easy Apply</li>
    </ul>
  `;
  return li;
}

describe("parseKeywords", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseKeywords("Promoted, On-site,  Senior ")).toEqual(["Promoted", "On-site", "Senior"]);
  });

  it("drops empty entries", () => {
    expect(parseKeywords("Promoted,,  ,Senior")).toEqual(["Promoted", "Senior"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseKeywords("   ")).toEqual([]);
  });
});

describe("extractCardText", () => {
  it("pulls title, company, location, and footer labels", () => {
    const text = extractCardText(buildRealisticCard());
    expect(text).toContain("Senior Java Software Engineer");
    expect(text).toContain("Scherzi Systems, LLC");
    expect(text).toContain("East Syracuse, NY (Hybrid)");
    expect(text).toContain("Promoted");
    expect(text).toContain("Easy Apply");
  });

  it("returns an empty string for a card with no recognized fields", () => {
    const li = document.createElement("li");
    li.textContent = "some random unrelated wrapper text";
    expect(extractCardText(li)).toBe("");
  });
});

describe("matchedKeyword", () => {
  it("matches case-insensitively by default when asked", () => {
    expect(matchedKeyword("Senior Java Engineer", ["java"], true)).toBe("java");
  });

  it("does not match when case-sensitive and casing differs", () => {
    expect(matchedKeyword("Senior Java Engineer", ["java"], false)).toBeNull();
  });

  it("matches an exact case when case-sensitive", () => {
    expect(matchedKeyword("Senior Java Engineer", ["Java"], false)).toBe("Java");
  });

  it("returns the first matching keyword among several", () => {
    expect(matchedKeyword("Remote Senior Contract role", ["Staff", "Senior", "Contract"], true)).toBe("Senior");
  });

  it("returns null when nothing matches", () => {
    expect(matchedKeyword("Remote Junior role", ["Staff", "Senior"], true)).toBeNull();
  });
});
