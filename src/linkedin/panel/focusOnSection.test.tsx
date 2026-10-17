// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FocusOnSection, keywordSetKey } from "./FocusOnSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLElement;
const onSave = vi.fn();

function mount(keywords: string) {
  act(() => root.render(<FocusOnSection keywords={keywords} onSave={onSave} />));
}
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
function type(value: string) {
  const textarea = container.querySelector("textarea")!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onSave.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("FocusOnSection", () => {
  it("shows the saved keywords compactly, with no editor until Edit", () => {
    mount("Python,  robotics\nvolunteer");
    expect(container.querySelector(".lw-an-goal__label")!.textContent).toBe("Highlight on profile");
    expect(container.textContent).not.toContain("Focus on");
    expect(container.querySelector("p")!.textContent).toBe("Python, robotics, volunteer");
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("has a human empty state", () => {
    mount("");
    expect(container.textContent).toContain("Add specific words or phrases");
    expect(container.textContent).not.toMatch(/undefined|0 keywords|None/);
  });

  it("keeps Save disabled until the keywords really change, and again once changed back", () => {
    mount("Python, robotics");
    act(() => button("Edit").click());
    expect(container.querySelector("textarea")!.value).toBe("Python, robotics");
    expect(button("Save").disabled).toBe(true);
    type(" python\nROBOTICS, Python ");
    expect(button("Save").disabled).toBe(true);
    type("Python, robotics, volunteer");
    expect(button("Save").disabled).toBe(false);
    type("Python, robotics");
    expect(button("Save").disabled).toBe(true);
    type("Python");
    expect(button("Save").disabled).toBe(false);
  });

  it("saves only on Save, and Cancel keeps the old keywords", () => {
    mount("Python");
    act(() => button("Edit").click());
    type("Python, TSA");
    act(() => button("Cancel").click());
    expect(onSave).not.toHaveBeenCalled();
    expect(container.querySelector("p")!.textContent).toBe("Python");
    act(() => button("Edit").click());
    type("Python, TSA ");
    act(() => button("Save").click());
    expect(onSave).toHaveBeenCalledWith("Python, TSA");
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("edits like Looking for: no helper text, a live counter, a 500-character limit, and Cancel before Save outside the box", () => {
    mount("Python");
    act(() => button("Edit").click());
    const textarea = container.querySelector("textarea")!;
    expect(textarea.maxLength).toBe(500);
    expect(container.textContent).not.toContain("Comma or newline separated");
    expect(container.querySelector(".char-count")!.textContent).toBe("6 / 500");
    type("x".repeat(600));
    expect(textarea.value).toHaveLength(500);
    expect(container.querySelector(".char-count")!.textContent).toBe("500 / 500");
    const actions = container.querySelector(".lw-goal__footer .lw-goal__actions")!;
    expect([...actions.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Cancel", "Save"]);
    expect(actions.contains(textarea)).toBe(false);
    expect(textarea.parentElement!.contains(actions)).toBe(true);
    expect(textarea.closest(".lw-goal__footer")).toBeNull();
  });

  it("compares keywords the way the highlighter matches them", () => {
    expect(keywordSetKey("Python, robotics")).toBe(keywordSetKey(" python\nROBOTICS,, robotics"));
    expect(keywordSetKey("machine learning")).not.toBe(keywordSetKey("machine, learning"));
  });
});
