// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoalSetupSection, isGoalDraftUnchanged, normalizeGoalText } from "./GoalSetupSection";
import { generateCriteria } from "../../ai/generateCriteria";
import type { Goal } from "../../models/goal";

vi.mock("../../ai/generateCriteria", () => ({
  generateCriteria: vi.fn(() => Promise.resolve({ name: "Developers", criteria: [{ label: "Python", importance: "MUST_HAVE", category: "skill" }] })),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const goal: Goal = {
  id: "g1",
  name: "Multilingual developers",
  description: "Developers who speak several languages",
  criteria: [{ id: "c1", label: "Software development", importance: "MUST_HAVE", category: "skill" }],
};

let root: Root;
let container: HTMLElement;
const onSet = vi.fn();

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onSet.mockClear();
  vi.mocked(generateCriteria).mockClear();
  act(() => root.render(<GoalSetupSection goal={goal} profileKey="jordan" onSetActiveCriteria={onSet} />));
  act(() => [...container.querySelectorAll("button")].find((b) => b.textContent === "Edit")!.click());
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

const save = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Save")!;
function type(value: string) {
  const textarea = container.querySelector("textarea")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("editing the active goal", () => {
  it("puts Cancel before Save", () => {
    expect([...container.querySelectorAll(".lw-goal__actions button")].map((b) => b.textContent)).toEqual(["Cancel", "Save"]);
  });

  it("keeps Save visible but disabled until something actually changes", () => {
    expect(save()).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it("treats spacing and case as no change", () => {
    type("  Developers   who speak\nseveral languages  ");
    expect(save().disabled).toBe(true);
    type("developers who speak several LANGUAGES");
    expect(save().disabled).toBe(true);
  });

  it("enables Save for a real change, and disables it again when changed back", () => {
    type("Developers who speak several languages and know Python");
    expect(save().disabled).toBe(false);
    type("Developers who speak several languages");
    expect(save().disabled).toBe(true);
  });

  it("never asks AI or writes the goal when nothing changed", async () => {
    await act(async () => save().click());
    expect(generateCriteria).not.toHaveBeenCalled();
    expect(onSet).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Updated your active goal");
  });

  it("saves a real change", async () => {
    type("Developers who know Python");
    await act(async () => save().click());
    expect(generateCriteria).toHaveBeenCalledTimes(1);
    expect(onSet).toHaveBeenCalledTimes(1);
  });
});

describe("goal text comparison", () => {
  it("normalizes whitespace and case only", () => {
    expect(normalizeGoalText("  A\n\tB  c ")).toBe("a b c");
    expect(isGoalDraftUnchanged("Developers who speak several languages ", goal)).toBe(true);
    expect(isGoalDraftUnchanged("Developers who speak two languages", goal)).toBe(false);
    expect(isGoalDraftUnchanged("anything", null)).toBe(false);
  });
});
