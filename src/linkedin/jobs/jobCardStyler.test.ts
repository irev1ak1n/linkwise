// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyCardAction, ensureJobStylesInjected, restoreCard } from "./jobCardStyler";

function freshCard(): HTMLElement {
  const li = document.createElement("li");
  document.body.appendChild(li);
  return li;
}

describe("applyCardAction", () => {
  it("adds a hidden class for hide", () => {
    const card = freshCard();
    applyCardAction(card, "hide");
    expect(card.classList.contains("lw-job-hidden")).toBe(true);
  });

  it("adds a highlight class for highlight", () => {
    const card = freshCard();
    applyCardAction(card, "highlight");
    expect(card.classList.contains("lw-job-highlight")).toBe(true);
  });

  it("clears both classes for none", () => {
    const card = freshCard();
    applyCardAction(card, "hide");
    applyCardAction(card, "none");
    expect(card.classList.contains("lw-job-hidden")).toBe(false);
    expect(card.classList.contains("lw-job-highlight")).toBe(false);
  });

  it("switching from hide to highlight removes the hidden class", () => {
    const card = freshCard();
    applyCardAction(card, "hide");
    applyCardAction(card, "highlight");
    expect(card.classList.contains("lw-job-hidden")).toBe(false);
    expect(card.classList.contains("lw-job-highlight")).toBe(true);
  });

  it("never touches LinkedIn's own classes", () => {
    const card = freshCard();
    card.className = "job-card-container some-linkedin-class";
    applyCardAction(card, "hide");
    expect(card.classList.contains("job-card-container")).toBe(true);
    expect(card.classList.contains("some-linkedin-class")).toBe(true);
  });
});

describe("restoreCard", () => {
  it("removes both LinkWise classes, restoring LinkedIn's normal appearance", () => {
    const card = freshCard();
    applyCardAction(card, "highlight");
    restoreCard(card);
    expect(card.className).toBe("");
  });
});

describe("ensureJobStylesInjected", () => {
  it("injects exactly one style element even when called repeatedly", () => {
    ensureJobStylesInjected(document);
    ensureJobStylesInjected(document);
    ensureJobStylesInjected(document);
    expect(document.querySelectorAll("#lw-jobs-style")).toHaveLength(1);
  });
});
