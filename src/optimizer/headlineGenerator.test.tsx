// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HeadlineGenerator, HeadlineOptionCard, buildHeadlineRequest } from "./HeadlineGenerator";
import { copyText } from "./copyText";
import type { OptimizeProfileRequestBody } from "./optimizerClient";
import type { HeadlineOptionsOutcome } from "./optimizerTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const body: OptimizeProfileRequestBody = {
  profile: { identity: "me", evidence: [{ id: "headline:0", section: "headline", text: "Student developer", evidenceType: "headline" }] },
  sections: [],
  userContext: "I know Rust",
};

let root: Root | null = null;
function render(node: React.ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
  return container;
}

function setInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("headline generator", () => {
  it("builds the request from known evidence plus the user's inputs", () => {
    const request = buildHeadlineRequest(body, "Student developer", { targetRole: " Software Engineer ", keywords: "C++, full-stack, robotics", additionalContext: "", language: "English" });
    expect(request).toEqual({
      profile: body.profile,
      currentHeadline: "Student developer",
      targetRole: "Software Engineer",
      keywords: "C++, full-stack, robotics",
      additionalContext: "",
      language: "English",
      userContext: "I know Rust",
    });
  });

  it("sends the form and lists the returned options", async () => {
    const outcome: HeadlineOptionsOutcome = { status: "ok", options: [{ label: "Technical", headline: "Aspiring Software Engineer | C++" }] };
    const request = vi.fn(() => ({ requestId: "r", promise: Promise.resolve(outcome), cancel: vi.fn() }));
    const container = render(<HeadlineGenerator body={body} currentHeadline="Student developer" request={request} />);
    const [role, keywords] = Array.from(container.querySelectorAll("input"));
    act(() => setInput(role, "Software Engineer"));
    act(() => setInput(keywords, "C++, robotics"));
    await act(async () => container.querySelector<HTMLButtonElement>(".lw-opt-form .lw-button")!.click());
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ targetRole: "Software Engineer", keywords: "C++, robotics", language: "English" }));
    expect(container.textContent).toContain("Aspiring Software Engineer | C++");
  });

  it("copies an option and confirms it", async () => {
    const copy = vi.fn(() => Promise.resolve(true));
    const container = render(<HeadlineOptionCard option={{ label: "Balanced", headline: "Student developer | C++" }} copy={copy} />);
    await act(async () => container.querySelector("button")!.click());
    expect(copy).toHaveBeenCalledWith("Student developer | C++");
    expect(container.textContent).toContain("Copied ✓");
  });

  it("falls back to a temporary text area when the clipboard API is refused", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) }, configurable: true });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
    await expect(copyText("hello")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
